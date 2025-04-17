import { Command } from 'commander';
import inquirer from 'inquirer';
import kleur from 'kleur';
import ora from 'ora';

import { DatadogService } from '../services/datadog';
import { MigrationService } from '../services/migration';
import {loadConfig, createDefaultConfig, debug} from '../utils/config';
import { formatMessageDiff } from '../utils/diff';
import { DatadogConfig, IncidentioConfig, MigrationType } from '../types';

export function registerAddIncidentioCommand(program: Command): void {
  program
    .command('add-incidentio')
    .description('Add incident.io webhooks to monitors that use PagerDuty')
    .requiredOption('-k, --api-key <key>', 'Datadog API key')
    .requiredOption('-a, --app-key <key>', 'Datadog App key')
    .option('-c, --config <path>', 'Path to config file (will be created if it doesn\'t exist)')
    .option('-d, --dry-run', 'Dry run mode (no actual changes)')
    .option('-s, --single-webhook', 'Use a single webhook for all monitors')
    .option('-v, --verbose', 'Show detailed output including unchanged monitors', true)
    .option('-t, --tags <tags>', 'Filter monitors by tags (comma-separated)')
    .option('-n, --name <pattern>', 'Filter monitors by name pattern')
    .option('--message <pattern>', 'Filter monitors by message pattern')
    .option('--validate-mappings', 'Validate all PagerDuty services have mappings')
    .action(async (options) => {
      let datadogConfig: DatadogConfig;
      let incidentioConfig: IncidentioConfig;
      let mappings = [];

      try {
        // Load config if provided, otherwise prompt for credentials
        if (options.config) {
          try {
            const config = loadConfig(options.config);
            datadogConfig = config.datadogConfig;
            incidentioConfig = config.incidentioConfig;
            mappings = config.mappings;
          } catch (err) {
            // If config file doesn't exist, but API keys are provided, continue without it
            if (options.apiKey && options.appKey) {
              console.log(kleur.yellow(`Config file ${options.config} not found, but using provided API keys.`));
            } else {
              // Re-throw if we don't have API keys
              throw err;
            }
          }
        }
        
        // If not loaded from config, create default or use command line options
        if (!datadogConfig) {
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
          
          // Ask about webhook strategy
          if (!options.singleWebhook) {
            const { webhookStrategy } = await inquirer.prompt([
              {
                type: 'list',
                name: 'webhookStrategy',
                message: 'How do you want to tag incident.io webhooks?',
                choices: [
                  { name: 'Single webhook for all monitors', value: 'single' },
                  { name: 'Team-specific webhooks based on mappings', value: 'team' }
                ]
              }
            ]);
            
            options.singleWebhook = webhookStrategy === 'single';
          }
          
          // If team-specific, ask for the webhook name format
          if (!options.singleWebhook) {
            const { format } = await inquirer.prompt([
              {
                type: 'input',
                name: 'format',
                message: 'Enter the webhook name format (use {team} placeholder):',
                default: defaultConfig.incidentioConfig.webhookNameFormat,
                validate: (input) => input.includes('{team}') ? true : 'Format must include {team} placeholder'
              }
            ]);
            
            defaultConfig.incidentioConfig.webhookNameFormat = format;
          }
          
          datadogConfig = defaultConfig.datadogConfig;
          incidentioConfig = defaultConfig.incidentioConfig;
        }

        // Create Datadog service with credentials
        const credentials = {
          apiKey: options.apiKey,
          appKey: options.appKey
        };
        const datadogService = new DatadogService(datadogConfig, credentials);
        
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

        // Create migration service with dryRun explicitly set
        const dryRunMode = options.dryRun === true;
        debug(`Using dry run mode: ${dryRunMode ? 'YES' : 'NO'}`);
        
        const migrationService = new MigrationService(
          datadogService,
          incidentioConfig,
          mappings,
          { dryRun: dryRunMode }
        );

        // Perform migration
        spinner.start(options.dryRun ? 'Simulating migration...' : 'Migrating monitors...');
        
        // Prepare filter options if specified
        const filterOptions = prepareFilterOptions(options);
        
        const result = await migrationService.migrateMonitors({
          type: MigrationType.ADD_INCIDENTIO_WEBHOOK,
          dryRun: dryRunMode,
          singleWebhook: options.singleWebhook,
          verbose: options.verbose,
          filter: filterOptions,
          validateMappings: options.validateMappings
        });

        spinner.succeed(options.dryRun ? 'Simulation complete' : 'Migration complete');
        
        // Show results
        console.log(kleur.bold('\nResults:'));
        console.log(`Processed: ${kleur.blue(result.processed)}`);
        console.log(`Updated: ${kleur.green(result.updated)}`);
        console.log(`Unchanged: ${kleur.yellow(result.unchanged)}`);
        
        // Show changes
        if (result.changes.length > 0) {
          console.log(kleur.bold('\nChanges:'));
          for (const change of result.changes) {
            if (change.before !== change.after) {
              console.log(kleur.bold(`\nMonitor #${change.id}: ${change.name}`));
              console.log(kleur.yellow('Before:'));
              console.log(`  ${change.before}`);
              console.log(kleur.green('After:'));
              console.log(`  ${formatMessageDiff(change.before, change.after, 'add')}`);
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
          console.log(kleur.cyan('\nThis was a dry run. No changes were made.'));
          console.log(kleur.cyan('Run again without --dry-run to apply changes.'));
        }
      } catch (error) {
        console.error(kleur.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });
}

/**
 * Prepare filter options from command arguments
 */
function prepareFilterOptions(options: any): FilterOptions | undefined {
  if (!options.tags && !options.name && !options.message) {
    return undefined;
  }
  
  const filterOptions: FilterOptions = {};
  
  if (options.tags) {
    filterOptions.tags = options.tags.split(',').map((t: string) => t.trim());
  }
  
  if (options.name) {
    filterOptions.namePattern = new RegExp(options.name, 'i');
  }
  
  if (options.message) {
    filterOptions.messagePattern = new RegExp(options.message, 'i');
  }
  
  return filterOptions;
}