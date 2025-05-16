import kleur from "kleur";
import inquirer from "inquirer";
import Denomander from "https://deno.land/x/denomander@0.9.3/src/Denomander.ts";

import { MigrationType } from "../types/index.ts";
import { prepareFilterOptions } from "../types/prepareFilterOptions.ts";
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

export function registerRemoveIncidentioCommand(program: Denomander): void {
  const command = program
    .command("remove-incidentio")
    .description("Remove incident.io webhooks from monitors");

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
      const { migrationService } = createMigrationService(
        datadogService,
        options.config,
        dryRunMode
      );
      
      const spinner = createSpinner();

      // Confirm action if not in dry run mode
      if (!dryRunMode) {
        spinner.stop();
        
        const { confirmed } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirmed",
            message: "This will remove all incident.io webhooks from monitors. Continue?",
            default: false,
          },
        ]);

        if (!confirmed) {
          console.log(kleur.yellow("Operation cancelled."));
          Deno.exit(0);
        }
        
        spinner.start("Connecting to Datadog API");
      }

      // Update spinner message
      spinner.start(
        dryRunMode
          ? "Simulating removal..."
          : "Removing incident.io webhooks..."
      );

      // Prepare filter options if specified
      const filterOptions = prepareFilterOptions(options);

      const result = await migrationService.migrateMonitors({
        type: MigrationType.REMOVE_INCIDENTIO_WEBHOOK,
        dryRun: dryRunMode,
        verbose: options.verbose,
        filter: filterOptions,
      });

      displayMigrationResults(spinner, "remove", result, options);
    })
  );
}