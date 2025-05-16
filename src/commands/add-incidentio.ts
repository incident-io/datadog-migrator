import kleur from "kleur";
import ora from "ora";
import inquirer from "inquirer";

import { DatadogService } from "../services/datadog.ts";
import { MigrationService } from "../services/migration.ts";
import { debug, loadConfig } from "../utils/config.ts";
import { MigrationType } from "../types/index.ts";
import { prepareFilterOptions } from "../types/prepareFilterOptions.ts";
import { displayMigrationResults } from "./remove-incidentio.ts";
import Denomander from "https://deno.land/x/denomander@0.9.3/src/Denomander.ts";

const identity = (i: string) => i;
export function registerAddIncidentioCommand(program: Denomander): void {
  program
    .command("add-incidentio")
    .description("Add incident.io webhooks to monitors that use PagerDuty or Opsgenie")
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
        "show-monitors"?: boolean;
      }) => {
        try {
          // Load config if provided, otherwise prompt for credentials
          const config = loadConfig(options.config);
          const incidentioConfig = config.incidentioConfig;
          const mappings = config.mappings;
          const datadogService = new DatadogService({
            apiKey: options["api-key"],
            appKey: options["app-key"],
          });

          const spinner = ora("Connecting to Datadog API").start();

          // Confirm action if not in dry run mode
          if (!options["dry-run"]) {
            spinner.stop();
            // Get provider information from config
            const provider = incidentioConfig.source || 'pagerduty';
            const providerName = provider === 'opsgenie' ? 'Opsgenie' : 'PagerDuty';
            
            const webhookType = !incidentioConfig.webhookPerTeam
              ? "a single incident.io webhook (@webhook-incident-io)"
              : "team-specific incident.io webhooks (@webhook-incident-io-team)";

            // Show tag message if enabled
            const tagMessage =
              !incidentioConfig.webhookPerTeam && incidentioConfig.addTeamTags
                ? ` and add team tags (${incidentioConfig.teamTagPrefix}:team-name)`
                : "";

            const { confirmed } = await inquirer.prompt([
              {
                type: "confirm",
                name: "confirmed",
                message: `This will add ${webhookType}${tagMessage} to monitors with ${providerName} services.${!incidentioConfig.webhookPerTeam && incidentioConfig.addTeamTags ? `\n  Team tags will be derived from your ${providerName}-to-team mappings in config.json.` : ""}\n  Continue?`,
                default: false,
              },
            ]);

            if (!confirmed) {
              console.log(kleur.yellow("Operation cancelled."));
              Deno.exit(0);
            }
            spinner.start("Connecting to Datadog API");
          }

          // Create migration service with dryRun explicitly set
          const dryRunMode = options["dry-run"] === true;
          debug(`Using dry run mode: ${dryRunMode ? "YES" : "NO"}`);

          const migrationService = new MigrationService(
            datadogService,
            incidentioConfig,
            mappings,
            { dryRun: dryRunMode },
          );

          // Perform migration
          spinner.start(
            options["dry-run"]
              ? "Simulating migration..."
              : "Migrating monitors...",
          );

          // Prepare filter options if specified
          const filterOptions = prepareFilterOptions(options);

          const result = await migrationService.migrateMonitors({
            type: MigrationType.ADD_INCIDENTIO_WEBHOOK,
            dryRun: dryRunMode,
            webhookPerTeam: incidentioConfig.webhookPerTeam,
            verbose: options.verbose,
            filter: filterOptions,
          });

          displayMigrationResults(spinner, "add", result, options);

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
