import { Command } from 'commander';
import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import kleur from 'kleur';
import ora from 'ora';

import { createDefaultConfig, updateConfigMappings } from '../utils/config';
import { DatadogService } from '../services/datadog';
import { DatadogMonitor } from '../types';

export function registerInitConfigCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize a new configuration file')
    .requiredOption('-k, --api-key <key>', 'Datadog API key')
    .requiredOption('-a, --app-key <key>', 'Datadog App key')
    .option('-p, --path <path>', 'Path to save the config file', './config.json')
    .action(async (options) => {
      try {
        // Check if the file already exists
        const configPath = path.resolve(options.path);
        if (fs.existsSync(configPath)) {
          const { overwrite } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'overwrite',
              message: `File ${options.path} already exists. Overwrite?`,
              default: false
            }
          ]);
          
          if (!overwrite) {
            console.log(kleur.yellow('Operation cancelled.'));
            return;
          }
        }

        // Create default config
        const defaultConfig = createDefaultConfig();
        
        // Datadog credentials will be provided as CLI arguments when running commands
        
        // Ask about incident.io configuration
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
        
        if (webhookStrategy === 'single') {
          const { webhookName } = await inquirer.prompt([
            {
              type: 'input',
              name: 'webhookName',
              message: 'Enter the name for the single webhook:',
              default: 'webhook-incident-io'
            }
          ]);
          
          defaultConfig.incidentioConfig.defaultWebhook = webhookName;
        } else {
          const { format } = await inquirer.prompt([
            {
              type: 'input',
              name: 'format',
              message: 'Enter the webhook name format (use {team} placeholder):',
              default: 'webhook-incident-io-{team}',
              validate: (input) => input.includes('{team}') ? true : 'Format must include {team} placeholder'
            }
          ]);
          
          defaultConfig.incidentioConfig.webhookNameFormat = format;
          
          // Ask if they want to create some mappings now
          const { createMappings } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'createMappings',
              message: 'Do you want to create PagerDuty service to incident.io team mappings now?',
              default: true
            }
          ]);
          
          if (createMappings) {
            let addMore = true;
            while (addMore) {
              const mapping = await inquirer.prompt([
                {
                  type: 'input',
                  name: 'pagerdutyService',
                  message: 'Enter PagerDuty service name:',
                  validate: (input) => input ? true : 'Service name is required'
                },
                {
                  type: 'input',
                  name: 'incidentioTeam',
                  message: 'Enter corresponding incident.io team name:',
                  validate: (input) => input ? true : 'Team name is required'
                }
              ]);
              
              defaultConfig.mappings.push({
                pagerdutyService: mapping.pagerdutyService,
                incidentioTeam: mapping.incidentioTeam
              });
              
              const { addAnother } = await inquirer.prompt([
                {
                  type: 'confirm',
                  name: 'addAnother',
                  message: 'Add another mapping?',
                  default: false
                }
              ]);
              
              addMore = addAnother;
            }
          }
        }
        
        // Write the config file
        const spinner = ora('Creating configuration file').start();
        
        try {
          const dirPath = path.dirname(configPath);
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
          }
          
          fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
          spinner.succeed(`Configuration file created at ${options.path}`);
          
          // Now detect PagerDuty services automatically
          spinner.start('Detecting PagerDuty services from monitors');
          
          try {
            // Create Datadog service with credentials
            const credentials = {
              apiKey: options.apiKey,
              appKey: options.appKey
            };
            
            const datadogService = new DatadogService(defaultConfig.datadogConfig, credentials);
            
            // Get all monitors to detect PagerDuty services
            const monitors = await datadogService.getMonitors();
            
            // Extract all PagerDuty services
            const pdPattern = /@pagerduty-(\S+)/g;
            const services = new Set<string>();
            
            for (const monitor of monitors) {
              const matches = [...monitor.message.matchAll(pdPattern)];
              for (const match of matches) {
                services.add(match[1]);
              }
            }
            
            const pagerDutyServices = [...services].sort();
            spinner.succeed(`Detected ${pagerDutyServices.length} PagerDuty services`);
            
            if (pagerDutyServices.length > 0) {
              // Create mappings for detected services (excluding ones already manually added)
              const existingServices = new Set(defaultConfig.mappings.map(m => m.pagerdutyService));
              const newMappings = [];
              
              for (const service of pagerDutyServices) {
                if (!existingServices.has(service)) {
                  defaultConfig.mappings.push({
                    pagerdutyService: service,
                    incidentioTeam: null // Placeholder for user to fill in
                  });
                  newMappings.push(service);
                }
              }
              
              // Update the config file with the new mappings
              fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
              
              if (newMappings.length > 0) {
                console.log(kleur.green(`\nAdded ${newMappings.length} PagerDuty service mappings to config file:`));
                console.log(newMappings.map(s => `  - ${s}`).join('\n'));
                console.log(kleur.yellow('\nPlease edit the file to fill in the incidentioTeam values before migrating.'));
              }
            } else {
              console.log(kleur.yellow('\nNo PagerDuty services detected in your monitors.'));
            }
          } catch (detectionError) {
            spinner.fail('Failed to detect PagerDuty services');
            console.error(kleur.red(`Error: ${detectionError instanceof Error ? detectionError.message : String(detectionError)}`));
            console.log(kleur.yellow('Config file was created but automatic PagerDuty service detection failed.'));
          }
        } catch (error) {
          spinner.fail('Failed to create configuration file');
          console.error(kleur.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        }
      } catch (error) {
        console.error(kleur.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
}