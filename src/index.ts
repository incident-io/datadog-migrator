#!/usr/bin/env node

import { Command } from "commander";
import dotenv from "dotenv";

import { displayBanner } from "./utils/banner.ts";
import { registerAddIncidentioCommand } from "./commands/add-incidentio.ts";
import { registerRemoveIncidentioCommand } from "./commands/remove-incidentio.ts";
import { registerRemovePagerdutyCommand } from "./commands/remove-pagerduty.ts";
import { registerInitConfigCommand } from "./commands/init-config.ts";
import { registerAnalyzeCommand } from "./commands/analyze.ts";

// Load environment variables from .env file
dotenv.config();

// Display banner
displayBanner();

// Create program
const program = new Command();

// Program metadata
program
  .name("datadog-migrator")
  .description(
    "CLI tool to migrate Datadog monitors between PagerDuty and incident.io",
  )
  .version("1.0.0");

// Register commands
registerInitConfigCommand(program);
registerAnalyzeCommand(program);
registerAddIncidentioCommand(program);
registerRemoveIncidentioCommand(program);
registerRemovePagerdutyCommand(program);

// Parse command line arguments
program.parse(Deno.args);

// Show help if no command is provided
if (!Deno.args.slice(2).length) {
  program.outputHelp();
}
