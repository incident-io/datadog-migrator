#!/usr/bin/env -S deno run --allow-read --allow-env --allow-net --allow-write

import Denomander from "https://deno.land/x/denomander/mod.ts";

import "@std/dotenv/load";
import { displayBanner } from "./utils/banner.ts";
import { registerAddIncidentioCommand } from "./commands/add-incidentio.ts";
import { registerRemoveIncidentioCommand } from "./commands/remove-incidentio.ts";
import { registerRemoveProviderCommand } from "./commands/remove-provider.ts";
import { registerInitConfigCommand } from "./commands/init-config.ts";
import { registerAnalyzeCommand } from "./commands/analyze.ts";


// Display banner
displayBanner();

// Create program
const program = new Denomander({
  app_name: "datadog-migrator",
  app_description: "CLI tool to migrate Datadog monitors from PagerDuty/Opsgenie to incident.io",
});

// Register commands
registerInitConfigCommand(program);
registerAnalyzeCommand(program);
registerAddIncidentioCommand(program);
registerRemoveIncidentioCommand(program);
registerRemoveProviderCommand(program);

Deno.addSignalListener("SIGINT", () => {
  Deno.exit();
});

// Parse Deno args
try {
  program.parse(Deno.args);
} catch (error) {
  console.error(error.message);
  program.showHelp();
}

// Show help if no command is provided
if (Deno.args.length === 0) {
  program.showHelp();
}

