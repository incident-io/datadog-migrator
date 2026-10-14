#!/usr/bin/env bun

import { Command } from "commander";

import { displayBanner } from "./utils/banner.ts";
import { registerAddIncidentioCommand } from "./commands/add-incidentio.ts";
import { registerRemoveIncidentioCommand } from "./commands/remove-incidentio.ts";
import { registerRemoveProviderCommand } from "./commands/remove-provider.ts";
import { registerInitConfigCommand } from "./commands/init-config.ts";
import { registerAnalyzeCommand } from "./commands/analyze.ts";

// Display banner
displayBanner();

// Create program
const program = new Command()
  .name("datadog-migrator")
  .description(
    "CLI tool to migrate Datadog monitors from PagerDuty/Opsgenie to incident.io",
  );

// Register commands
registerInitConfigCommand(program);
registerAnalyzeCommand(program);
registerAddIncidentioCommand(program);
registerRemoveIncidentioCommand(program);
registerRemoveProviderCommand(program);

process.on("SIGINT", () => {
  process.exit();
});

await program.parseAsync(process.argv);
