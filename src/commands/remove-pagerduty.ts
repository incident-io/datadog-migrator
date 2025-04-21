import { Command } from "commander";
import inquirer from "inquirer";
import kleur from "kleur";
import ora from "ora";

import { DatadogService } from "@/services/datadog";
import { MigrationService } from "@/services/migration";
import { loadConfig } from "@/utils/config";
import { formatMessageDiff } from "@/utils/diff";
import { MigrationType } from "@/types";
import { prepareFilterOptions } from "@/types/prepareFilterOptions";
import { displayMigrationResults } from "@/commands/remove-incidentio";

export function registerRemovePagerdutyCommand(program: Command): void {
  program
    .command("remove-pagerduty")
    .description("Remove PagerDuty service mentions from monitors")
    .option(
      "-k, --api-key <key>",
      "Datadog API key",
      process.env.DATADOG_API_KEY,
    )
    .option(
      "-a, --app-key <key>",
      "Datadog App key",
      process.env.DATADOG_APP_KEY,
    )
    .requiredOption(
      "-c, --config <path>",
      "Path to config file (will be created if it doesn't exist)",
    )
    .option("-d, --dry-run", "Dry run mode (no actual changes)")
    .option(
      "-v, --verbose",
      "Show detailed output including unchanged monitors",
      true,
    )
    .option("-t, --tags <tags>", "Filter monitors by tags (comma-separated)")
    .option("-n, --name <pattern>", "Filter monitors by name pattern")
    .option("--message <pattern>", "Filter monitors by message pattern")
    .action(
      async (options: {
        apiKey: string;
        appKey: string;
        config: string;
        dryRun?: boolean;
        verbose?: boolean;
        tags?: string;
        name?: string;
        message?: string;
      }) => {
        try {
          // Load config if provided, otherwise prompt for credentials
          const config = loadConfig(options.config);
          const incidentioConfig = config.incidentioConfig;

          const datadogService = new DatadogService({
            apiKey: options.apiKey,
            appKey: options.appKey,
          });

          // Confirm action
          if (!options.dryRun) {
            const { confirmed } = await inquirer.prompt([
              {
                type: "confirm",
                name: "confirmed",
                message:
                  "This will remove all PagerDuty service mentions from monitors. Continue?",
                default: false,
              },
            ]);

            if (!confirmed) {
              console.log(kleur.yellow("Operation cancelled."));
              process.exit(0);
            }
          }

          // Create migration service
          const migrationService = new MigrationService(
            datadogService,
            incidentioConfig,
            [],
            { dryRun: options.dryRun },
          );
          const spinner = ora("Connecting to Datadog API").start();


          // Perform migration
          spinner.start(
            options.dryRun
              ? "Simulating removal..."
              : "Removing PagerDuty service mentions...",
          );

          // Prepare filter options if specified
          const filterOptions = prepareFilterOptions(options);

          const result = await migrationService.migrateMonitors({
            type: MigrationType.REMOVE_PAGERDUTY,
            dryRun: options.dryRun,
            verbose: options.verbose,
            filter: filterOptions,
          });

          displayMigrationResults(spinner, result, options)
        } catch (error) {
          console.error(
            kleur.red(
              `\nError: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
          process.exit(1);
        }
      },
    );
}

