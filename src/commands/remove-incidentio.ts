import { Command } from "commander";
import inquirer from "inquirer";
import kleur from "kleur";
import ora, { Ora } from "ora";

import { DatadogService } from "@/services/datadog";
import { MigrationService } from "@/services/migration";
import { loadConfig } from "@/utils/config";
import { formatMessageDiff } from "@/utils/diff";
import { MigrationType } from "@/types";
import { prepareFilterOptions } from "@/types/prepareFilterOptions";

export function registerRemoveIncidentioCommand(program: Command): void {
  program
    .command("remove-incidentio")
    .description("Remove incident.io webhooks from monitors")
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
          const config = loadConfig(options.config);
          const datadogService = new DatadogService({
            apiKey: options.apiKey,
            appKey: options.appKey,
          });

          const spinner = ora("Connecting to Datadog API").start();

          // Confirm action
          if (!options.dryRun) {
            const { confirmed } = await inquirer.prompt([
              {
                type: "confirm",
                name: "confirmed",
                message:
                  "This will remove all incident.io webhooks from monitors. Continue?",
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
            config.incidentioConfig,
            [],
            { dryRun: options.dryRun },
          );

          // Perform migration
          spinner.start(
            options.dryRun
              ? "Simulating removal..."
              : "Removing incident.io webhooks...",
          );

          // Prepare filter options if specified
          const filterOptions = prepareFilterOptions(options);

          const result = await migrationService.migrateMonitors({
            type: MigrationType.REMOVE_INCIDENTIO_WEBHOOK,
            dryRun: options.dryRun,
            verbose: options.verbose,
            filter: filterOptions,
          });

          displayMigrationResults(spinner, 'remove', result, options);
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

export const displayMigrationResults = (
  spinner: Ora,
  type: 'add' | 'remove',
  result: {
    processed: number;
    updated: number;
    unchanged: number;
    errors: { id: number; error: string }[];
    changes?: {
      id: number;
      name: string;
      before: string;
      after: string;
      reason?: string;
    }[];
  },
  options: {
    dryRun?: boolean;
    verbose?: boolean;
  },
): void => {
  spinner.succeed(options.dryRun ? "Simulation complete" : "Update complete");

  // Show results
  console.log(kleur.bold("\nResults:"));
  console.log(`Processed: ${kleur.blue(result.processed)}`);
  console.log(`Updated: ${kleur.green(result.updated)}`);
  console.log(`Unchanged: ${kleur.yellow(result.unchanged)}`);

  // Show changes
  if (result.changes && result.changes.length > 0) {
    console.log(kleur.bold("\nChanges:"));
    for (const change of result.changes) {
      if (change.before !== change.after) {
        console.log(kleur.bold(`\nMonitor #${change.id}: ${change.name}`));
        console.log(kleur.yellow("Before:"));
        console.log(
          `  ${formatMessageDiff(change.before, change.after, type)}`,
        );
        console.log(kleur.green("After:"));
        console.log(`  ${change.after}`);
      } else if (options.verbose && change.reason) {
        console.log(kleur.bold(`\nMonitor #${change.id}: ${change.name}`));
        console.log(`  ${kleur.gray(`[Unchanged - ${change.reason}]`)}`);
        console.log(`  ${change.before}`);
      }
    }
  }

  if (result.errors.length > 0) {
    console.log(kleur.red(`\nErrors (${result.errors.length}):`));
    for (const error of result.errors) {
      console.log(kleur.red(`  - Monitor ID ${error.id}: ${error.error}`));
    }
  }

  if (options.dryRun) {
    console.log(kleur.cyan("\nThis was a dry run. No changes were made."));
    console.log(kleur.cyan("Run again without --dry-run to apply changes."));
  }
};
