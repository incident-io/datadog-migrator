import { Command } from 'commander';
import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import { kleur } from 'kleur';
import ora from 'ora';

import { createDefaultConfig } from '../utils/config';

export function registerInitConfigCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize a new configuration file')
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
        
        // Ask for Datadog credentials
        const datadogAnswers = await inquirer.prompt([
          {
            type: 'input',
            name: 'apiKey',
            message: 'Enter your Datadog API key:',
            validate: (input) => input ? true : 'API key is required'
          },
          {
            type: 'input',
            name: 'appKey',
            message: 'Enter your Datadog App key:',
            validate: (input) => input ? true : 'App key is required'
          }
        ]);
        
        defaultConfig.datadogConfig.apiKey = datadogAnswers.apiKey;
        defaultConfig.datadogConfig.appKey = datadogAnswers.appKey;
        
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
        } catch (error) {
          spinner.fail('Failed to create configuration file');
          console.error(kleur.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        }
      } catch (error) {
        console.error(kleur.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
}