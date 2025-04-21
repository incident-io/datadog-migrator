import { Command } from "commander";
import kleur from "kleur";
import ora from "ora";
import boxen from "boxen";

import { DatadogService } from "@/services/datadog";
import { loadConfig } from "@/utils/config";
import { DatadogMonitor, MigrationMapping } from "@/types";

export function registerAnalyzeCommand(program: Command): void {
  program
    .command("analyze")
    .description("Analyze Datadog monitors and validate configuration")
    .option(
      "-k, --api-key <key>",
      "Datadog API key",
      process.env.DATADOG_API_KEY,
    )
    .option(
      "-a, --app-key <key>",
      "Datadog App key",
      process.env.DATADOG_APP_KEY,
    )
    .requiredOption("-c, --config <path>", "Path to config file")
    .option("-t, --tags <tags>", "Filter monitors by tags (comma-separated)")
    .option("-n, --name <pattern>", "Filter monitors by name pattern")
    .option("-m, --message <pattern>", "Filter monitors by message pattern")
    .option("--show-monitors", "Show detailed list of monitors")
    .action(
      async (options: {
        apiKey: string;
        appKey: string;
        config: string;
        tags?: string;
        name?: string;
        message?: string;
        showMonitors?: boolean;
      }) => {
        const config = loadConfig(options.config);
        const mappings = config.mappings;
        try {
          const datadogService = new DatadogService({
            apiKey: options.apiKey,
            appKey: options.appKey,
          });

          const spinner = ora("Connecting to Datadog API").start();
          let monitors: DatadogMonitor[];

          try {
            monitors = await datadogService.getMonitors();
            spinner.succeed("Connected to Datadog API");
          } catch (error) {
            spinner.fail("Failed to connect to Datadog API");
            console.error(
              kleur.red(
                `Error: ${error instanceof Error ? error.message : String(error)}`,
              ),
            );
            process.exit(1);
          }

          // Apply filters if provided
          const filteredMonitors = filterMonitors(monitors, options);

          // Analyze the monitors
          spinner.start("Analyzing monitors");
          const stats = analyzeMonitors(filteredMonitors);
          spinner.succeed("Analysis complete");

          // Display the stats
          displayStats(stats, filteredMonitors.length);

          // Display mapping validation
          validateMappings(stats, mappings);

          // Show detailed monitor list if requested
          if (options.showMonitors) {
            displayMonitorDetails(filteredMonitors);
          }
        } catch (error) {
          console.error(
            kleur.red(
              `\nError: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
          process.exit(1);
        }
      },
    );
}

/**
 * Filter monitors based on command line options
 */
function filterMonitors(
  monitors: DatadogMonitor[],
  options: {
    tags?: string;
    name?: string;
    message?: string;
  },
): DatadogMonitor[] {
  let filtered = [...monitors];

  // Filter by tags
  if (options.tags) {
    const tags = options.tags.split(",").map((t: string) => t.trim());
    filtered = filtered.filter((monitor) =>
      tags.some((tag) => monitor.tags.includes(tag)),
    );
  }

  // Filter by name
  if (options.name) {
    const namePattern = new RegExp(options.name, "i");
    filtered = filtered.filter((monitor) => namePattern.test(monitor.name));
  }

  // Filter by message content
  if (options.message) {
    const messagePattern = new RegExp(options.message, "i");
    filtered = filtered.filter((monitor) =>
      messagePattern.test(monitor.message),
    );
  }

  return filtered;
}

interface MonitorStats {
  total: number;
  pagerduty: {
    count: number;
    services: { [service: string]: number };
  };
  incidentio: {
    count: number;
    webhooks: { [webhook: string]: number };
  };
  // Monitors with both PD and incident.io
  both: number;
  // Monitors with neither PD nor incident.io
  neither: number;
}

/**
 * Analyze monitors to get statistics
 */
function analyzeMonitors(monitors: DatadogMonitor[]): MonitorStats {
  const stats: MonitorStats = {
    total: monitors.length,
    pagerduty: {
      count: 0,
      services: {},
    },
    incidentio: {
      count: 0,
      webhooks: {},
    },
    both: 0,
    neither: 0,
  };

  // PagerDuty service pattern
  const pdPattern = /@pagerduty-(\S+)/g;

  // Incident.io webhook pattern
  const incidentPattern = /@webhook-incident-io(-\S+)?/g;

  for (const monitor of monitors) {
    const { message } = monitor;

    // Check for PagerDuty mentions
    const pdMatches = [...message.matchAll(pdPattern)];
    const hasPagerDuty = pdMatches.length > 0;

    if (hasPagerDuty) {
      stats.pagerduty.count++;

      // Count each service
      for (const match of pdMatches) {
        const service = match[1]; // Extract service name
        stats.pagerduty.services[service] =
          (stats.pagerduty.services[service] || 0) + 1;
      }
    }

    // Check for incident.io webhooks
    const incidentMatches = [...message.matchAll(incidentPattern)];
    const hasIncidentio = incidentMatches.length > 0;

    if (hasIncidentio) {
      stats.incidentio.count++;

      // Count each webhook
      for (const match of incidentMatches) {
        const webhook = match[0]; // Full webhook name
        stats.incidentio.webhooks[webhook] =
          (stats.incidentio.webhooks[webhook] || 0) + 1;
      }
    }

    // Count monitors with both or neither
    if (hasPagerDuty && hasIncidentio) {
      stats.both++;
    } else if (!hasPagerDuty && !hasIncidentio) {
      stats.neither++;
    }
  }

  return stats;
}

/**
 * Display statistics in a nice format
 */
function displayStats(stats: MonitorStats, totalFiltered: number): void {
  const getPercentage = (count: number): string => {
    return `${((count / totalFiltered) * 100).toFixed(1)}%`;
  };

  // Create summary box
  const summary = [
    `${kleur.bold("Monitor Analysis Summary")}`,
    ``,
    `${kleur.bold("Total Monitors:")} ${stats.total} (${getPercentage(stats.total)} of filtered)`,
    `${kleur.blue("Using PagerDuty:")} ${stats.pagerduty.count} (${getPercentage(stats.pagerduty.count)})`,
    `${kleur.green("Using incident.io:")} ${stats.incidentio.count} (${getPercentage(stats.incidentio.count)})`,
    `${kleur.yellow("Using Both:")} ${stats.both} (${getPercentage(stats.both)})`,
    `${kleur.gray("Using Neither:")} ${stats.neither} (${getPercentage(stats.neither)})`,
  ].join("\n");

  console.log(
    boxen(summary, {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: "cyan",
    }),
  );

  // Display PagerDuty services
  if (Object.keys(stats.pagerduty.services).length > 0) {
    console.log(kleur.bold("\nPagerDuty Services:"));

    const sortedServices = Object.entries(stats.pagerduty.services).sort(
      (a, b) => b[1] - a[1],
    ); // Sort by count, descending

    for (const [service, count] of sortedServices) {
      console.log(
        `  ${kleur.blue(service)}: ${count} monitors (${getPercentage(count)})`,
      );
    }
  }

  // Display incident.io webhooks
  if (Object.keys(stats.incidentio.webhooks).length > 0) {
    console.log(kleur.bold("\nincident.io Webhooks:"));

    const sortedWebhooks = Object.entries(stats.incidentio.webhooks).sort(
      (a, b) => b[1] - a[1],
    ); // Sort by count, descending

    for (const [webhook, count] of sortedWebhooks) {
      console.log(
        `  ${kleur.green(webhook)}: ${count} monitors (${getPercentage(count)})`,
      );
    }
  }
}

/**
 * Validate mappings against detected PagerDuty services
 */
function validateMappings(
  stats: MonitorStats,
  mappings: MigrationMapping[],
): void {
  const services = Object.keys(stats.pagerduty.services);

  // Create a map of services to their team mappings
  const mappingsMap = new Map();
  for (const mapping of mappings) {
    if (mapping.pagerdutyService) {
      mappingsMap.set(mapping.pagerdutyService, mapping.incidentioTeam);
    }
  }

  // Find services without any mapping
  const unmappedServices = services.filter((s) => !mappingsMap.has(s));

  // Find services with null team values
  const nullMappings = services.filter(
    (s) => mappingsMap.has(s) && mappingsMap.get(s) === null,
  );

  console.log(kleur.bold("\nMapping Validation:"));

  if (unmappedServices.length === 0 && nullMappings.length === 0) {
    console.log(
      kleur.green("  ✓ All PagerDuty services have complete mappings"),
    );
  } else {
    // Show unmapped services
    if (unmappedServices.length > 0) {
      console.log(
        kleur.red(
          `  ✗ ${unmappedServices.length} PagerDuty services lack mappings:`,
        ),
      );
      unmappedServices.forEach((service) => {
        const count = stats.pagerduty.services[service];
        console.log(kleur.red(`    - ${service} (used in ${count} monitors)`));
      });
    }

    // Show null-mapped services
    if (nullMappings.length > 0) {
      console.log(
        kleur.yellow(
          `  ! ${nullMappings.length} PagerDuty services are found in the config but don't have teams assigned:`,
        ),
      );
      nullMappings.forEach((service) => {
        const count = stats.pagerduty.services[service];
        console.log(
          kleur.yellow(`    - ${service} (used in ${count} monitors)`),
        );
      });
    }

    // Provide guidance
    if (unmappedServices.length > 0) {
      console.log(kleur.cyan("\nCreate mappings for these services:"));

      // Generate example mapping config for unmapped services
      const exampleMappings = unmappedServices.map((service) => {
        return {
          pagerdutyService: service,
          incidentioTeam: null,
        };
      });

      console.log(`
# Run this command to generate a mappings file:
./dist/index.js generate-mappings --config your-config.json

# Or add these to your existing mappings:
${JSON.stringify(exampleMappings, null, 2)}
      `);
    }

    if (nullMappings.length > 0) {
      console.log(
        kleur.cyan(
          "\nPlease assign incident.io teams to these services in your config using an alias from Catalog in incident.io.",
        ),
      );
    }
  }
}

/**
 * Display detailed information about monitors
 */
function displayMonitorDetails(monitors: DatadogMonitor[]): void {
  console.log(kleur.bold("\nMonitor Details:"));

  // Display each monitor's tags first
  console.log(kleur.bold("\nMonitor Tags:"));
  monitors.forEach((monitor) => {
    console.log(`  ${kleur.bold(`#${monitor.id}`)}: ${monitor.name}`);
    console.log(
      `    Tags: ${monitor.tags.length > 0 ? monitor.tags.join(", ") : "No tags"}`,
    );
  });

  // Group monitors by their notification configuration
  const pdOnly = monitors.filter((monitor) => {
    return (
      monitor.message.match(/@pagerduty-(\S+)/g) &&
      !monitor.message.match(/@webhook-incident-io(-\S+)?/g)
    );
  });

  const incidentOnly = monitors.filter((monitor) => {
    return (
      !monitor.message.match(/@pagerduty-(\S+)/g) &&
      monitor.message.match(/@webhook-incident-io(-\S+)?/g)
    );
  });

  const both = monitors.filter((monitor) => {
    return (
      monitor.message.match(/@pagerduty-(\S+)/g) &&
      monitor.message.match(/@webhook-incident-io(-\S+)?/g)
    );
  });

  const neither = monitors.filter((monitor) => {
    return (
      !monitor.message.match(/@pagerduty-(\S+)/g) &&
      !monitor.message.match(/@webhook-incident-io(-\S+)?/g)
    );
  });

  // Display each group
  if (pdOnly.length > 0) {
    console.log(kleur.blue("\nMonitors using PagerDuty only:"));
    pdOnly.forEach((monitor) => {
      console.log(`  ${kleur.bold(`#${monitor.id}`)}: ${monitor.name}`);
      console.log(`    ${extractMentions(monitor.message)}`);
    });
  }

  if (incidentOnly.length > 0) {
    console.log(kleur.green("\nMonitors using incident.io only:"));
    incidentOnly.forEach((monitor) => {
      console.log(`  ${kleur.bold(`#${monitor.id}`)}: ${monitor.name}`);
      console.log(`    ${extractMentions(monitor.message)}`);
    });
  }

  if (both.length > 0) {
    console.log(
      kleur.yellow("\nMonitors using both PagerDuty and incident.io:"),
    );
    both.forEach((monitor) => {
      console.log(`  ${kleur.bold(`#${monitor.id}`)}: ${monitor.name}`);
      console.log(`    ${extractMentions(monitor.message)}`);
    });
  }

  if (neither.length > 0) {
    console.log(
      kleur.gray("\nMonitors using neither PagerDuty nor incident.io:"),
    );
    neither.forEach((monitor) => {
      console.log(`  ${kleur.bold(`#${monitor.id}`)}: ${monitor.name}`);
    });
  }
}

/**
 * Extract and highlight mentions in a message
 */
function extractMentions(message: string): string {
  let result = message;

  // Highlight PagerDuty mentions
  result = result.replace(
    /@pagerduty-(\S+)/g,
    (match) => `${kleur.blue(match)}`,
  );

  // Highlight incident.io webhooks
  result = result.replace(
    /@webhook-incident-io(-\S+)?/g,
    (match) => `${kleur.green(match)}`,
  );

  return result;
}
