import inquirer from "inquirer";
import kleur from "kleur";
import ora from "ora";

import { DatadogService } from "../services/datadog.ts";
import { MigrationService } from "../services/migration.ts";
import { loadConfig } from "../utils/config.ts";
import { MigrationType } from "../types/index.ts";
import { prepareFilterOptions } from "../types/prepareFilterOptions.ts";
import { displayMigrationResults } from "./remove-incidentio.ts";
import Denomander from "https://deno.land/x/denomander@0.9.3/src/Denomander.ts";

const identity = (i: string) => i;
export function registerRemoveProviderCommand(program: Denomander): void {
  program
    .command("remove-provider")
    .description("Remove PagerDuty or Opsgenie service mentions from monitors")
    .option(
      "-k, --api-key",
      "Datadog API key",
      identity,
      Deno.env.get("DATADOG_API_KEY"),
    )
    .option(
      "-a, --app-key",
      "Datadog App key",
      identity,
      Deno.env.get("DATADOG_APP_KEY"),
    )
    .requiredOption("-c, --config", "Path to config file")
    .option("-d, --dry-run", "Dry run mode (no actual changes)")
    .option(
      "-v, --verbose",
      "Show detailed output including unchanged monitors",
      identity,
      true,
    )
    .option("-t, --tags", "Filter monitors by tags (comma-separated)")
    .option("-n, --name", "Filter monitors by name pattern")
    .option("--message", "Filter monitors by message pattern")
    .action(
      async (options: {
        "dry-run"?: boolean;
        verbose: boolean;

        "api-key": string;
        "app-key": string;
        config: string;
        tags?: string;
        name?: string;
        message?: string;
      }) => {
        try {
          // Load config if provided, otherwise prompt for credentials
          const config = loadConfig(options.config);
          const incidentioConfig = config.incidentioConfig;

          const datadogService = new DatadogService({
            apiKey: options["api-key"],
            appKey: options["app-key"],
          });

          // Get provider information
          const provider = incidentioConfig.source || 'pagerduty';
          const providerName = provider === 'opsgenie' ? 'Opsgenie' : 'PagerDuty';
          
          // Confirm action with stronger verification
          if (!options["dry-run"]) {
            console.log(kleur.yellow("\n⚠️  WARNING: This is a destructive operation ⚠️"));
            console.log(kleur.yellow(`This will remove all ${providerName} service mentions from your monitors.`));
            console.log(kleur.yellow("This action cannot be automatically undone.\n"));
            
            const { confirmText } = await inquirer.prompt([
              {
                type: "input",
                name: "confirmText",
                message: "Type CONFIRM to proceed:",
                validate: (input: string) =>
                  input === "CONFIRM" ? 
                    true : 
                    "You must type CONFIRM (all uppercase) to continue"
              },
            ]);

            if (confirmText !== "CONFIRM") {
              console.log(kleur.yellow("Operation cancelled."));
              Deno.exit(0);
            }
            
            console.log(kleur.green(`Confirmation received. Proceeding with ${providerName} removal...`));
          }

          // Create migration service
          const migrationService = new MigrationService(
            datadogService,
            incidentioConfig,
            [],
            { dryRun: options["dry-run"] },
          );
          const spinner = ora("Connecting to Datadog API").start();

          // Perform migration
          spinner.start(
            options["dry-run"]
              ? "Simulating removal..."
              : `Removing ${providerName} service mentions...`,
          );

          // Prepare filter options if specified
          const filterOptions = prepareFilterOptions(options);

          const result = await migrationService.migrateMonitors({
            type: MigrationType.REMOVE_PAGERDUTY,
            dryRun: options["dry-run"],
            verbose: options.verbose,
            filter: filterOptions,
          });

          displayMigrationResults(spinner, "remove", result, options);

          Deno.exit(0);
        } catch (error) {
          console.error(
            kleur.red(
              `\nError: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
          Deno.exit(1);
        }
      },
    );
}
