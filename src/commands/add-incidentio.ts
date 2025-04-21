import { Command } from "commander";
import kleur from "kleur";
import ora from "ora";

import { DatadogService } from "@/services/datadog";
import { MigrationService } from "@/services/migration";
import { debug, loadConfig } from "@/utils/config";
import { MigrationType } from "@/types";
import { prepareFilterOptions } from "@/types/prepareFilterOptions";
import { displayMigrationResults } from "@/commands/remove-incidentio";

export function registerAddIncidentioCommand(program: Command): void {
  program
    .command("add-incidentio")
    .description("Add incident.io webhooks to monitors that use PagerDuty")
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
    .requiredOption("-c, --config <path>", "Path to config file")
    .option("-d, --dry-run", "Dry run mode (no actual changes)")
    .option("-s, --single-webhook", "Use a single webhook for all monitors")
    .option(
      "-v, --verbose",
      "Show detailed output including unchanged monitors",
      true,
    )
    .option("-t, --tags <tags>", "Filter monitors by tags (comma-separated)")
    .option("-n, --name <pattern>", "Filter monitors by name pattern")
    .option("--message <pattern>", "Filter monitors by message pattern")
    .option(
      "--validate-mappings",
      "Validate all PagerDuty services have mappings",
    )
    .action(
      async (options: {
        apiKey: string;
        appKey: string;
        config: string;
        dryRun?: boolean;
        singleWebhook?: boolean;
        verbose?: boolean;
        tags?: string;
        name?: string;
        message?: string;
        validateMappings?: boolean;
      }) => {
        try {
          // Load config if provided, otherwise prompt for credentials
          const config = loadConfig(options.config);
          const incidentioConfig = config.incidentioConfig;
          const mappings = config.mappings;
          const datadogService = new DatadogService({
            apiKey: options.apiKey,
            appKey: options.appKey,
          });

          const spinner = ora("Connecting to Datadog API").start();

          // Create migration service with dryRun explicitly set
          const dryRunMode = options.dryRun === true;
          debug(`Using dry run mode: ${dryRunMode ? "YES" : "NO"}`);

          const migrationService = new MigrationService(
            datadogService,
            incidentioConfig,
            mappings,
            { dryRun: dryRunMode },
          );

          // Perform migration
          spinner.start(
            options.dryRun
              ? "Simulating migration..."
              : "Migrating monitors...",
          );

          // Prepare filter options if specified
          const filterOptions = prepareFilterOptions(options);

          const result = await migrationService.migrateMonitors({
            type: MigrationType.ADD_INCIDENTIO_WEBHOOK,
            dryRun: dryRunMode,
            singleWebhook: options.singleWebhook,
            verbose: options.verbose,
            filter: filterOptions,
            validateMappings: options.validateMappings,
          });

          displayMigrationResults(spinner, result, options);
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
