import { Command } from 'commander';
import inquirer from 'inquirer';
import { kleur } from 'kleur';
import ora from 'ora';

import { DatadogService } from '../services/datadog';
import { MigrationService } from '../services/migration';
import { loadConfig, createDefaultConfig } from '../utils/config';
import { DatadogConfig, IncidentioConfig, MigrationType } from '../types';

export function registerRemoveIncidentioCommand(program: Command): void {
  program
    .command('remove-incidentio')
    .description('Remove incident.io webhooks from monitors')
    .option('-k, --api-key <key>', 'Datadog API key')
    .option('-a, --app-key <key>', 'Datadog App key')
    .option('-c, --config <path>', 'Path to config file')
    .option('-d, --dry-run', 'Dry run mode (no actual changes)')
    .action(async (options) => {
      let datadogConfig: DatadogConfig;
      let incidentioConfig: IncidentioConfig;

      try {
        // Load config if provided, otherwise prompt for credentials
        if (options.config) {
          const config = loadConfig(options.config);
          datadogConfig = config.datadogConfig;
          incidentioConfig = config.incidentioConfig;
        } else {
          const defaultConfig = createDefaultConfig();
          
          // Override with CLI options if provided
          if (options.apiKey) defaultConfig.datadogConfig.apiKey = options.apiKey;
          if (options.appKey) defaultConfig.datadogConfig.appKey = options.appKey;
          
          // If keys are still missing, prompt for them
          if (!defaultConfig.datadogConfig.apiKey || !defaultConfig.datadogConfig.appKey) {
            const answers = await inquirer.prompt([
              {
                type: 'input',
                name: 'apiKey',
                message: 'Enter your Datadog API key:',
                when: !defaultConfig.datadogConfig.apiKey,
                validate: (input) => input ? true : 'API key is required'
              },
              {
                type: 'input',
                name: 'appKey',
                message: 'Enter your Datadog App key:',
                when: !defaultConfig.datadogConfig.appKey,
                validate: (input) => input ? true : 'App key is required'
              }
            ]);
            
            if (answers.apiKey) defaultConfig.datadogConfig.apiKey = answers.apiKey;
            if (answers.appKey) defaultConfig.datadogConfig.appKey = answers.appKey;
          }
          
          datadogConfig = defaultConfig.datadogConfig;
          incidentioConfig = defaultConfig.incidentioConfig;
        }

        // Create Datadog service
        const datadogService = new DatadogService(datadogConfig);
        
        // Verify connection
        const spinner = ora('Connecting to Datadog API').start();
        try {
          await datadogService.getMonitors();
          spinner.succeed('Connected to Datadog API');
        } catch (error) {
          spinner.fail('Failed to connect to Datadog API');
          console.error(kleur.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
          process.exit(1);
        }

        // Confirm action
        if (!options.dryRun) {
          const { confirmed } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirmed',
              message: 'This will remove all incident.io webhooks from monitors. Continue?',
              default: false
            }
          ]);
          
          if (!confirmed) {
            console.log(kleur.yellow('Operation cancelled.'));
            process.exit(0);
          }
        }

        // Create migration service
        const migrationService = new MigrationService(
          datadogService,
          incidentioConfig,
          [],
          { dryRun: options.dryRun }
        );

        // Perform migration
        spinner.start(options.dryRun ? 'Simulating removal...' : 'Removing incident.io webhooks...');
        
        const result = await migrationService.migrateMonitors({
          type: MigrationType.REMOVE_INCIDENTIO_WEBHOOK,
          dryRun: options.dryRun
        });

        spinner.succeed(options.dryRun ? 'Simulation complete' : 'Removal complete');
        
        // Show results
        console.log(kleur.bold('\nResults:'));
        console.log(`Processed: ${kleur.blue(result.processed)}`);
        console.log(`Updated: ${kleur.green(result.updated)}`);
        console.log(`Unchanged: ${kleur.yellow(result.unchanged)}`);
        
        if (result.errors.length > 0) {
          console.log(kleur.red(`\nErrors (${result.errors.length}):`));
          for (const error of result.errors) {
            console.log(kleur.red(`  - Monitor ID ${error.id}: ${error.error}`));
          }
        }

        if (options.dryRun) {
          console.log(kleur.cyan('\nThis was a dry run. No changes were made.'));
          console.log(kleur.cyan('Run again without --dry-run to apply changes.'));
        }
      } catch (error) {
        console.error(kleur.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });
}