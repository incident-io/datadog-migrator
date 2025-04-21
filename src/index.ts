#!/usr/bin/env node

import { Command } from "commander";
import dotenv from "dotenv";

import { displayBanner } from "./utils/banner.js";
import { registerAddIncidentioCommand } from "./commands/add-incidentio.js";
import { registerRemoveIncidentioCommand } from "./commands/remove-incidentio.js";
import { registerRemovePagerdutyCommand } from "./commands/remove-pagerduty.js";
import { registerInitConfigCommand } from "./commands/init-config.js";
import { registerAnalyzeCommand } from "./commands/analyze.js";

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
program.parse(process.argv);

// Show help if no command is provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
