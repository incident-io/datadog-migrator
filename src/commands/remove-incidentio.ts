import { Command } from "commander";
import inquirer from "inquirer";
import kleur from "kleur";
import ora, { Ora } from "ora";

import { DatadogService } from "../services/datadog.ts";
import { MigrationResult, MigrationService } from "../services/migration.ts";
import { loadConfig } from "../utils/config.ts";
import { formatMessageDiff } from "../utils/diff.ts";
import { MigrationType } from "../types/index.ts";
import { prepareFilterOptions } from "../types/prepareFilterOptions.ts";

export function registerRemoveIncidentioCommand(program: Command): void {
  program
    .command("remove-incidentio")
    .description("Remove incident.io webhooks from monitors")
    .option(
      "-k, --api-key <key>",
      "Datadog API key",
      Deno.env.get("DATADOG_API_KEY"),
    )
    .option(
      "-a, --app-key <key>",
      "Datadog App key",
      Deno.env.get("DATADOG_APP_KEY"),
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
              Deno.exit(0);
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

          displayMigrationResults(spinner, "remove", result, options);
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

export const displayMigrationResults = (
  spinner: Ora,
  type: "add" | "remove",
  result: MigrationResult,
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
      if (
        change.before !== change.after ||
        (change.tagsBefore && change.tagsAfter)
      ) {
        console.log(kleur.bold(`\nMonitor #${change.id}: ${change.name}`));

        // Show message changes
        if (change.before !== change.after) {
          console.log(kleur.yellow("Before:"));
          console.log(
            `  ${type === "add" ? change.before : formatMessageDiff(change.before, change.after, type)}`,
          );
          console.log(kleur.green("After:"));
          console.log(
            `  ${type === "add" ? formatMessageDiff(change.before, change.after, type) : change.after}`,
          );
        }

        // Show tag changes if present
        if (change.tagsBefore && change.tagsAfter) {
          const addedTags = change.tagsAfter.filter(
            (tag) => !change.tagsBefore?.includes(tag),
          );

          if (addedTags.length > 0) {
            console.log(kleur.green("Added Tags:"));
            console.log(`  ${addedTags.join(", ")}`);
          }
        }
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
