/**
 * Utilities for CLI command setup and execution
 */
import ora, { Ora } from "ora";
import { MigrationResult, MigrationService } from "../services/migration.ts";
import { formatMessageDiff } from "./diff.ts";
import Denomander from "https://deno.land/x/denomander@0.9.3/src/Denomander.ts";
import kleur from "kleur";

import { DatadogService } from "../services/datadog.ts";
import { loadConfig } from "./config.ts";
import { CommandOptions, identity } from "../types/cli.ts";
import { MigrationConfig } from "../types/index.ts";

// Re-export CommandOptions to make it available to command files
export { CommandOptions };

/**
 * Create a DatadogService instance from command options
 */
export function createDatadogService(options: {
  "api-key": string;
  "app-key": string;
}): DatadogService {
  return new DatadogService({
    apiKey: options["api-key"],
    appKey: options["app-key"],
  });
}

/**
 * Create a MigrationService instance from command options and config
 */
export function createMigrationService(
  datadogService: DatadogService,
  configPath: string,
  dryRun: boolean = false,
): { migrationService: MigrationService; config: MigrationConfig } {
  // Load config
  const config = loadConfig(configPath);
  const incidentioConfig = config.incidentioConfig;
  const mappings = config.mappings;

  // Create migration service
  const migrationService = new MigrationService(
    datadogService,
    incidentioConfig,
    mappings,
    { dryRun },
  );

  return { migrationService, config };
}

/**
 * Get provider information from config (standardized function)
 */
export function getProviderInfo(
  config: MigrationConfig,
): { source: string; displayName: string } {
  const source = config.incidentioConfig.source || "pagerduty";
  const displayName = source === "opsgenie" ? "Opsgenie" : "PagerDuty";

  return { source, displayName };
}

/**
 * Setup standard command authentication options
 */
export function setupAuthOptions(command: Denomander): Denomander {
  return command
    .option(
      CommandOptions.apiKey.flag,
      CommandOptions.apiKey.description,
      identity,
      Deno.env.get(CommandOptions.apiKey.defaultEnv),
    )
    .option(
      CommandOptions.appKey.flag,
      CommandOptions.appKey.description,
      identity,
      Deno.env.get(CommandOptions.appKey.defaultEnv),
    );
}

/**
 * Setup standard command filter options
 */
export function setupFilterOptions(command: Denomander): Denomander {
  return command
    .option(
      CommandOptions.tags.flag,
      CommandOptions.tags.description,
    )
    .option(
      CommandOptions.name.flag,
      CommandOptions.name.description,
    )
    .option(
      CommandOptions.message.flag,
      CommandOptions.message.description,
    );
}

/**
 * Setup standard command dry-run and verbose options
 */
export function setupExecutionOptions(command: Denomander): Denomander {
  return command
    .option(
      CommandOptions.dryRun.flag,
      CommandOptions.dryRun.description,
    )
    .option(
      CommandOptions.verbose.flag,
      CommandOptions.verbose.description,
      identity,
      CommandOptions.verbose.defaultValue,
    );
}

/**
 * Create standard command spinner
 */
export function createSpinner(message: string = "Connecting to Datadog API") {
  return ora(message).start();
}

/**
 * Standard command callback wrapper to handle errors
 */
export function withErrorHandling<T>(
  callback: (options: T) => Promise<void>,
) {
  return async (options: T): Promise<void> => {
    try {
      await callback(options);
      Deno.exit(0);
    } catch (error) {
      console.error(
        kleur.red(
          `\nError: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      Deno.exit(1);
    }
  };
}

export const displayMigrationResults = (
  spinner: Ora,
  type: "add" | "remove",
  result: MigrationResult,
  options: {
    "dry-run"?: boolean;
    verbose?: boolean;
  },
): void => {
  spinner.succeed(
    options["dry-run"] ? "Simulation complete" : "Update complete",
  );

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
            `  ${
              type === "add"
                ? change.before
                : formatMessageDiff(change.before, change.after, type)
            }`,
          );
          console.log(kleur.green("After:"));
          console.log(
            `  ${
              type === "add"
                ? formatMessageDiff(change.before, change.after, type)
                : change.after
            }`,
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

  if (options["dry-run"]) {
    console.log(kleur.cyan("\nThis was a dry run. No changes were made."));
    console.log(kleur.cyan("Run again without --dry-run to apply changes."));
  }
};
