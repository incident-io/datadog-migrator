import * as path from "https://deno.land/std/path/mod.ts";
import inquirer from "inquirer";
import kleur from "kleur";
import ora from "ora";

import { createDefaultConfig } from "../utils/config.ts";
import { DatadogService } from "../services/datadog.ts";
import { MigrationMapping } from "../types/index.ts";
import Denomander from "https://deno.land/x/denomander@0.9.3/src/Denomander.ts";

const identity = (i: string) => i;
export function registerInitConfigCommand(program: Denomander): void {
  program
    .command("init")
    .description("Initialize a new configuration file")
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
    .option(
      "-p, --path",
      "Path to save the config file",
      identity,
      "./config.json",
    )
    .action(
      async (options: { path: string; "api-key": string; "app-key": string }) => {
        try {
          // Check if the file already exists
          const configPath = path.resolve(options.path);
          try {
            const fileInfo = await Deno.stat(configPath);
            if (fileInfo.isFile) {
              console.log(
                `File ${options.path} already exists. Overwrite? (y/N)`,
              );
              const answer = prompt("> ");
              const overwrite =
                answer?.toLowerCase() === "y" ||
                answer?.toLowerCase() === "yes";

              if (!overwrite) {
                console.log(kleur.yellow("Operation cancelled."));
                return;
              }
            }
          } catch (err) {
            // File doesn't exist, continue
          }

          // Create default config
          const defaultConfig = createDefaultConfig();

          // Datadog credentials will be provided as CLI arguments when running commands

          // Ask about incident.io configuration
          const { webhookStrategy } = await inquirer.prompt([
            {
              type: "list",
              name: "webhookStrategy",
              message: "How do you want to tag incident.io webhooks?",
              choices: [
                {
                  name: "Single webhook for all monitors",
                  value: "single",
                  description:
                    "Create one webhook in Datadog that you tag in monitors with @webhook-incident-io. You would rely on monitor tags to identify teams, sending 'tags': $TAGS in the payload which incident.io can parse to determine ownership.",
                },
                {
                  name: "Team-specific webhooks based on mappings",
                  value: "team",
                  description:
                    "Create multiple webhooks in Datadog (one per team) that you tag with @webhook-incident-io-myteam.",
                },
              ],
            },
          ]);

          // Set webhook strategy
          defaultConfig.incidentioConfig.webhookPerTeam =
            webhookStrategy === "team";

          // If using single webhook, ask about team tagging
          if (webhookStrategy === "single") {
            const { teamTagStrategy } = await inquirer.prompt([
              {
                type: "list",
                name: "teamTagStrategy",
                message: "How do you want to identify teams in monitors?",
                choices: [
                  {
                    name: "Use existing tags on monitors",
                    value: "existing",
                    description:
                      "Use existing tags on your monitors to determine ownership. This requires your monitors to already have team tags.",
                  },
                  {
                    name: "Add team tags based on mappings",
                    value: "add",
                    description:
                      "Add team tags to your monitors based on the PagerDuty-to-Team mappings in your config file.",
                  },
                ],
              },
            ]);

            defaultConfig.incidentioConfig.addTeamTags =
              teamTagStrategy === "add";

            if (teamTagStrategy === "add") {
              const { tagPrefix } = await inquirer.prompt([
                {
                  type: "input",
                  name: "tagPrefix",
                  message:
                    "Enter the prefix for team tags (e.g. 'team' creates tags like 'team:eng'):",
                  default: "team",
                  validate: (input) =>
                    input ? true : "Please enter a tag prefix",
                },
              ]);

              defaultConfig.incidentioConfig.teamTagPrefix = tagPrefix;
            }
          }

          // Get incident.io alert source details
          // Check if webhook token is in env
          const envWebhookToken = Deno.env.get("INCIDENTIO_WEBHOOK_TOKEN");
          
          const promptQuestions: Parameters<typeof inquirer.prompt> = [
            {
              type: "input",
              name: "webhookUrl",
              message: "Enter the incident.io alert source URL:",
              validate: (input) =>
                input && input.startsWith("http")
                  ? true
                  : "Please enter a valid URL (should start with http or https)",
            },
          ];
          
          // Only prompt for webhook token if not in environment variable
          if (!envWebhookToken) {
            promptQuestions.push({
              type: "input",
              name: "webhookToken",
              message: "Enter the incident.io alert source secret token (or ctrl+c to quit and set it in your .env as INCIDENTIO_WEBHOOK_TOKEN):",
              validate: (input) =>
                input
                  ? true
                  : "Please enter the secret token from your incident.io alert source",
            });
          }

          // This is fine, it just doesn't like the generic
          // deno-lint-ignore ban-ts-comment
          // @ts-expect-error
          const answers = await inquirer.prompt(promptQuestions);
          const webhookUrl = answers.webhookUrl;
          const webhookToken = envWebhookToken || answers.webhookToken;
          
          if (!webhookToken && !envWebhookToken) {
            console.log(
              kleur.yellow(
                "\nNo webhook token provided. You can add it to your .env file as INCIDENTIO_WEBHOOK_TOKEN to avoid being prompted for it in the future."
              )
            );
            Deno.exit(1);
          }

          defaultConfig.incidentioConfig.webhookUrl = webhookUrl;

          // Clean up token input - handle various formats users might paste
          if (!envWebhookToken) {
            // Only process and store token in config if it doesn't come from env
            let cleanToken = webhookToken.trim();

            // Handle if they pasted a full header JSON object
            if (
              cleanToken.startsWith("{") &&
              cleanToken.includes("Authorization")
            ) {
              try {
                const headerObj = JSON.parse(cleanToken);
                if (
                  headerObj.Authorization &&
                  typeof headerObj.Authorization === "string"
                ) {
                  cleanToken = headerObj.Authorization;
                }
              } catch {
                // Not valid JSON, continue with other processing
              }
            }

            // Handle "Bearer token" format
            if (cleanToken.startsWith("Bearer ")) {
              cleanToken = cleanToken.substring(7).trim();
            }

            // Only store in config if not provided by environment
            defaultConfig.incidentioConfig.webhookToken = cleanToken;
          }

          console.log(
            kleur.blue(
              "\nWe'll scan for PagerDuty services and add them to your config file.",
            ),
          );
          console.log(
            kleur.blue(
              "You can edit the config file later to map these to incident.io teams.",
            ),
          );

          // Write the config file
          const spinner = ora("Creating configuration file").start();

          try {
            const dirPath = path.dirname(configPath);
            const dirExists = await Deno.stat(dirPath).catch(() => false);
            if (!dirExists) {
              await Deno.mkdir(dirPath, { recursive: true });
            }

            Deno.writeTextFileSync(
              configPath,
              JSON.stringify(defaultConfig, null, 2),
            );
            spinner.succeed(`Configuration file created at ${options.path}`);

            // Now detect PagerDuty services automatically
            spinner.start("Detecting PagerDuty services from monitors");

            try {
              const datadogService = new DatadogService({
                apiKey: options["api-key"],
                appKey: options["app-key"],
              });

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
              spinner.succeed(
                `Detected ${pagerDutyServices.length} PagerDuty services`,
              );

              if (pagerDutyServices.length > 0) {
                // Create mappings for detected services (excluding ones already manually added)
                const existingServices = new Set(
                  defaultConfig.mappings.map(
                    (m: MigrationMapping) => m.pagerdutyService,
                  ),
                );
                const newMappings = [];

                for (const service of pagerDutyServices) {
                  if (!existingServices.has(service)) {
                    defaultConfig.mappings.push({
                      pagerdutyService: service,
                      incidentioTeam: null, // Placeholder for user to fill in
                    });
                    newMappings.push(service);
                  }
                }

                // Update the config file with the new mappings
                Deno.writeTextFileSync(
                  configPath,
                  JSON.stringify(defaultConfig, null, 2),
                );

                if (newMappings.length > 0) {
                  console.log(
                    kleur.green(
                      `\nAdded ${newMappings.length} PagerDuty service mappings to config file:`,
                    ),
                  );
                  console.log(newMappings.map((s) => `  - ${s}`).join("\n"));
                  console.log(
                    kleur.yellow(
                      "\nPlease edit the file to fill and set the relevant incident-io teams before running the 'add-incidentio' command.",
                    ),
                  );
                  Deno.exit(0);
                }
              } else {
                console.log(
                  kleur.yellow(
                    "\nNo PagerDuty services detected in your monitors.",
                  ),
                );
              }
            } catch (detectionError) {
              spinner.fail("Failed to detect PagerDuty services");
              console.error(
                kleur.red(
                  `Error: ${detectionError instanceof Error ? detectionError.message : String(detectionError)}`,
                ),
              );
              console.log(
                kleur.yellow(
                  "Config file was created but automatic PagerDuty service detection failed.",
                ),
              );
            }
          } catch (error) {
            spinner.fail("Failed to create configuration file");
            console.error(
              kleur.red(
                `Error: ${error instanceof Error ? error.message : String(error)}`,
              ),
            );
          }
        } catch (error) {
          console.error(
            kleur.red(
              `Error: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
        }
      },
    );
}
