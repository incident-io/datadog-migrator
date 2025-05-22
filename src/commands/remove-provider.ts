import kleur from "kleur";
import inquirer from "inquirer";
import Denomander from "https://deno.land/x/denomander@0.9.3/src/Denomander.ts";

import { MigrationType } from "../types/index.ts";
import { prepareFilterOptions } from "../types/prepareFilterOptions.ts";
// Updated import to use shared utility
import { MigrationCommandOptions } from "../types/cli.ts";
import { 
  CommandOptions,
  createDatadogService, 
  createMigrationService,
  getProviderInfo,
  setupAuthOptions,
  setupFilterOptions,
  setupExecutionOptions,
  createSpinner,
  withErrorHandling,
  displayMigrationResults
} from "../utils/command.ts";

export function registerRemoveProviderCommand(program: Denomander): void {
  const command = program
    .command("remove-provider")
    .description("Remove PagerDuty or Opsgenie service mentions from monitors");

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
      
      // Get provider information
      const { displayName } = getProviderInfo(config);

      // Confirm action with stronger verification if not in dry run mode
      if (!dryRunMode) {
        console.log(kleur.yellow("\n⚠️  WARNING: This is a destructive operation ⚠️"));
        console.log(kleur.yellow(`This will remove all ${displayName} service mentions from your monitors.`));
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
        
        console.log(kleur.green(`Confirmation received. Proceeding with ${displayName} removal...`));
      }

      // Create spinner and start migration process
      const spinner = createSpinner();
      
      // Update spinner message
      spinner.start(
        dryRunMode
          ? "Simulating removal..."
          : `Removing ${displayName} service mentions...`
      );

      // Prepare filter options if specified
      const filterOptions = prepareFilterOptions(options);

      const result = await migrationService.migrateMonitors({
        type: MigrationType.REMOVE_PROVIDER,
        dryRun: dryRunMode,
        verbose: options.verbose,
        filter: filterOptions,
      });

      displayMigrationResults(spinner, "remove", result, options);
    })
  );
}