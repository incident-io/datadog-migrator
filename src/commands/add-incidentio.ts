import kleur from "kleur";
import inquirer from "inquirer";
import Denomander from "https://deno.land/x/denomander@0.9.3/src/Denomander.ts";

import { debug } from "../utils/config.ts";
import { MigrationType } from "../types/index.ts";
import { prepareFilterOptions } from "../types/prepareFilterOptions.ts";
// Updated import to use shared utility
import { MigrationCommandOptions } from "../types/cli.ts";
import { 
  CommandOptions,
  createDatadogService, 
  createMigrationService,
  setupAuthOptions,
  setupFilterOptions,
  setupExecutionOptions,
  createSpinner,
  withErrorHandling,
  displayMigrationResults
} from "../utils/command.ts";

export function registerAddIncidentioCommand(program: Denomander): void {
  const command = program
    .command("add-incidentio")
    .description("Add incident.io webhooks to monitors that use PagerDuty or Opsgenie");
  
  // Add standard options
  setupAuthOptions(command);
  setupFilterOptions(command);
  setupExecutionOptions(command);
  
  // Add required config option
  command.requiredOption(
    CommandOptions.config.flag,
    CommandOptions.config.description
  );
  
  // Set command action
  command.action(
    withErrorHandling(async (options: MigrationCommandOptions) => {
      // Create Datadog service
      const datadogService = createDatadogService(options);

      // Create migration service and load config
      const dryRunMode = options["dry-run"] === true;
      const { migrationService, config } = createMigrationService(
        datadogService,
        options.config,
        dryRunMode
      );
      
      const incidentioConfig = config.incidentioConfig;
      const spinner = createSpinner();

      // Confirm action if not in dry run mode
      if (!dryRunMode) {
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

      debug(`Using dry run mode: ${dryRunMode ? "YES" : "NO"}`);

      // Perform migration
      spinner.start(
        dryRunMode
          ? "Simulating migration..."
          : "Migrating monitors..."
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
    })
  );
}