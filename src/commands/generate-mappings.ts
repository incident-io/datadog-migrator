import { Command } from 'commander';
import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import kleur from 'kleur';
import ora from 'ora';

import { DatadogService } from '../services/datadog.js';
import { loadConfig, createDefaultConfig, updateConfigMappings } from '../utils/config.js';
import { DatadogConfig, IncidentioConfig, MigrationMapping } from '../types/index.js';

export function registerGenerateMappingsCommand(program: Command): void {
  program
    .command('generate-mappings')
    .description('Generate a mappings configuration file with detected PagerDuty services')
    .requiredOption('-k, --api-key <key>', 'Datadog API key')
    .requiredOption('-a, --app-key <key>', 'Datadog App key')
    .requiredOption('-c, --config <path>', 'Path to config file (will be created if it doesn\'t exist)')
    .option('-t, --tags <tags>', 'Filter monitors by tags (comma-separated)')
    .option('-n, --name <pattern>', 'Filter monitors by name pattern')
    .option('--message <pattern>', 'Filter monitors by message pattern')
    .action(async (options) => {
      let datadogConfig: DatadogConfig;
      let incidentioConfig: IncidentioConfig;
      let existingMappings: MigrationMapping[] = [];

      try {
        // Load or create config if path provided
        if (options.config) {
          try {
            const config = loadConfig(options.config, true); // Set create=true to create if not exists
            datadogConfig = config.datadogConfig;
            incidentioConfig = config.incidentioConfig;
            existingMappings = config.mappings;
            console.log(kleur.blue(`Loaded configuration from ${options.config}`));
          } catch (err) {
            console.log(kleur.red(`Failed to load or create config: ${err instanceof Error ? err.message : String(err)}`));
            process.exit(1);
          }
        } else {
          // If no config file provided, create default
          const defaultConfig = createDefaultConfig();
          datadogConfig = defaultConfig.datadogConfig;
          incidentioConfig = defaultConfig.incidentioConfig;
        }
        
        // Credentials should always come from CLI options first
        const credentials = {
          apiKey: options.apiKey,
          appKey: options.appKey
        };
        
        // If keys are missing, prompt for them
        if (!credentials.apiKey || !credentials.appKey) {
          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'apiKey',
              message: 'Enter your Datadog API key:',
              when: !credentials.apiKey,
              validate: (input) => input ? true : 'API key is required'
            },
            {
              type: 'input',
              name: 'appKey',
              message: 'Enter your Datadog App key:',
              when: !credentials.appKey,
              validate: (input) => input ? true : 'App key is required'
            }
          ]);
          
          if (answers.apiKey) credentials.apiKey = answers.apiKey;
          if (answers.appKey) credentials.appKey = answers.appKey;
        }

        // Create Datadog service
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

        // Detect PagerDuty services
        spinner.start('Detecting PagerDuty services');
        const pagerDutyServices = await detectPagerDutyServices(datadogService, options);
        spinner.succeed(`Detected ${pagerDutyServices.length} PagerDuty services`);

        // Start with existing mappings from config
        let mappings: MigrationMapping[] = [...existingMappings];
        console.log(kleur.blue(`Using ${mappings.length} existing mappings from config file`));
        
        // Create mapping entries for services that don't already have one
        const existingServices = new Set(mappings.map(m => m.pagerdutyService));
        let newCount = 0;
        
        for (const service of pagerDutyServices) {
          if (!existingServices.has(service)) {
            mappings.push({
              pagerdutyService: service,
              incidentioTeam: null // Placeholder for user to fill in
            });
            newCount++;
          }
        }

        // Save the mappings back to the config file
        updateConfigMappings(options.config, mappings);

        console.log(kleur.green(`\nMappings updated in config file: ${options.config}`));
        console.log(`Total services: ${kleur.bold(String(pagerDutyServices.length))}`);
        console.log(`New entries: ${kleur.bold(String(newCount))}`);
        console.log(`Existing entries: ${kleur.bold(String(mappings.length - newCount))}`);
        
        if (newCount > 0) {
          console.log(kleur.yellow('\nPlease edit the file to fill in the incidentioTeam values before migrating.'));
        }
      } catch (error) {
        console.error(kleur.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });
}

/**
 * Detect all PagerDuty services used in monitors
 */
async function detectPagerDutyServices(datadogService: DatadogService, options: any): Promise<string[]> {
  // Get all monitors
  const monitors = await datadogService.getMonitors();
  
  // Apply filters if specified
  const filteredMonitors = applyFilters(monitors, options);
  
  // Extract all PagerDuty services
  const pdPattern = /@pagerduty-(\S+)/g;
  const services = new Set<string>();
  
  for (const monitor of filteredMonitors) {
    const matches = [...monitor.message.matchAll(pdPattern)];
    
    for (const match of matches) {
      services.add(match[1]);
    }
  }
  
  return [...services].sort();
}

/**
 * Apply filters to monitors
 */
function applyFilters(monitors: any[], options: any): any[] {
  let filtered = [...monitors];
  
  // Filter by tags
  if (options.tags) {
    const tags = options.tags.split(',').map((t: string) => t.trim());
    filtered = filtered.filter(monitor => 
      tags.some(tag => monitor.tags.includes(tag))
    );
  }
  
  // Filter by name
  if (options.name) {
    const namePattern = new RegExp(options.name, 'i');
    filtered = filtered.filter(monitor => namePattern.test(monitor.name));
  }
  
  // Filter by message content
  if (options.message) {
    const messagePattern = new RegExp(options.message, 'i');
    filtered = filtered.filter(monitor => messagePattern.test(monitor.message));
  }
  
  return filtered;
}