import kleur from "kleur";
import boxen from "boxen";
import Denomander from "https://deno.land/x/denomander@0.9.3/src/Denomander.ts";

import { DatadogMonitor, MigrationMapping } from "../types/index.ts";
import { getServiceRegexForProvider } from "../utils/regex.ts";
import { AnalyzeCommandOptions } from "../types/cli.ts";
import { 
  CommandOptions,
  createDatadogService,
  setupAuthOptions,
  setupFilterOptions,
  createSpinner,
  withErrorHandling,
  getProviderInfo
} from "../utils/command.ts";
import { loadConfig } from "../utils/config.ts";

export function registerAnalyzeCommand(program: Denomander): void {
  const command = program
    .command("analyze")
    .description("Analyze Datadog monitors and validate provider mappings");

  // Add standard options
  setupAuthOptions(command);
  setupFilterOptions(command);
  
  // Add required config option
  command.requiredOption(
    CommandOptions.config.flag,
    CommandOptions.config.description
  );
  
  // Add analyze-specific options
  command.option(
    CommandOptions.showMonitors.flag,
    CommandOptions.showMonitors.description
  );
  
  // Set command action
  command.action(
    withErrorHandling(async (options: AnalyzeCommandOptions) => {
      // Load config for provider info
      const config = loadConfig(options.config);
      const mappings = config.mappings;
      
      // Get provider information
      const { source: providerSource, displayName: providerName } = getProviderInfo(config);
      
      // Create Datadog service
      const datadogService = createDatadogService(options);
      const spinner = createSpinner();
      
      let monitors: DatadogMonitor[];

      try {
        monitors = await datadogService.getMonitors();
        spinner.succeed("Connected to Datadog API");
      } catch (error) {
        spinner.fail("Failed to connect to Datadog API");
        throw error;
      }

      // Apply filters if provided
      const filteredMonitors = filterMonitors(monitors, options);

      // Analyze the monitors
      spinner.start("Analyzing monitors");
      const stats = analyzeMonitors(
        filteredMonitors,
        providerSource,
        providerName,
      );
      spinner.succeed("Analysis complete");

      // Display the stats
      displayStats(stats, filteredMonitors.length);

      // Display mapping validation
      validateMappings(stats, mappings);

      // Show detailed monitor list if requested
      if (options["show-monitors"]) {
        displayMonitorDetails(
          filteredMonitors,
          providerSource,
          providerName,
        );
      }
    })
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
      tags.some((tag) => monitor.tags.includes(tag))
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
      messagePattern.test(monitor.message)
    );
  }

  return filtered;
}

interface MonitorStats {
  total: number;
  provider: {
    name: string; // "pagerduty" or "opsgenie"
    displayName: string; // "PagerDuty" or "Opsgenie"
    count: number;
    services: { [service: string]: number };
  };
  incidentio: {
    count: number;
    webhooks: { [webhook: string]: number };
  };
  // Monitors with both provider and incident.io
  both: number;
  // Monitors with neither provider nor incident.io
  neither: number;
}

/**
 * Analyze monitors to get statistics
 */
function analyzeMonitors(
  monitors: DatadogMonitor[],
  providerSource: string,
  providerName: string,
): MonitorStats {
  const stats: MonitorStats = {
    total: monitors.length,
    provider: {
      name: providerSource,
      displayName: providerName,
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

  // Incident.io webhook pattern
  const incidentPattern = /@webhook-incident-io(-\S+)?/g;

  // Get the appropriate regex based on the provider
  const providerRegex = getServiceRegexForProvider(providerSource);

  for (const monitor of monitors) {
    const { message } = monitor;

    // Check for provider mentions
    const providerMatches = [...message.matchAll(providerRegex)];
    const hasProvider = providerMatches.length > 0;

    if (hasProvider) {
      stats.provider.count++;

      // Count each service
      for (const match of providerMatches) {
        const service = match[1]; // Extract service name
        stats.provider.services[service] =
          (stats.provider.services[service] || 0) + 1;
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
    if (hasProvider && hasIncidentio) {
      stats.both++;
    } else if (!hasProvider && !hasIncidentio) {
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
    `${kleur.bold("Total Monitors:")} ${stats.total} (${
      getPercentage(stats.total)
    } of filtered)`,
    `${
      kleur.blue(`Using ${stats.provider.displayName}:`)
    } ${stats.provider.count} (${getPercentage(stats.provider.count)})`,
    `${kleur.green("Using incident.io:")} ${stats.incidentio.count} (${
      getPercentage(stats.incidentio.count)
    })`,
    `${kleur.yellow("Using Both:")} ${stats.both} (${
      getPercentage(stats.both)
    })`,
    `${kleur.gray("Using Neither:")} ${stats.neither} (${
      getPercentage(stats.neither)
    })`,
  ].join("\n");

  console.log(
    boxen(summary, {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: "cyan",
    }),
  );

  // Display provider services
  if (Object.keys(stats.provider.services).length > 0) {
    console.log(kleur.bold(`\n${stats.provider.displayName} Services:`));

    const sortedServices = Object.entries(stats.provider.services).sort(
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
        `  ${kleur.green(webhook)}: ${count} monitors (${
          getPercentage(count)
        })`,
      );
    }
  }
}

/**
 * Validate mappings against detected provider services
 */
function validateMappings(
  stats: MonitorStats,
  mappings: MigrationMapping[],
): void {
  const providerSource = stats.provider.name;
  const providerName = stats.provider.displayName;
  const services = Object.keys(stats.provider.services);

  // Create a map of services to their team mappings
  const mappingsMap = new Map();
  for (const mapping of mappings) {
    if (providerSource === "opsgenie" && mapping.opsgenieService) {
      mappingsMap.set(mapping.opsgenieService, mapping.incidentioTeam);
    } else if (mapping.pagerdutyService) {
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
      kleur.green(`  ✓ All ${providerName} services have complete mappings`),
    );
  } else {
    // Show unmapped services
    if (unmappedServices.length > 0) {
      console.log(
        kleur.red(
          `  ✗ ${unmappedServices.length} ${providerName} services lack mappings:`,
        ),
      );
      unmappedServices.forEach((service) => {
        const count = stats.provider.services[service];
        console.log(kleur.red(`    - ${service} (used in ${count} monitors)`));
      });
    }

    // Show null-mapped services
    if (nullMappings.length > 0) {
      console.log(
        kleur.yellow(
          `  ! ${nullMappings.length} ${providerName} services are found in the config but don't have teams assigned:`,
        ),
      );
      nullMappings.forEach((service) => {
        const count = stats.provider.services[service];
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
        if (providerSource === "opsgenie") {
          return {
            opsgenieService: service,
            incidentioTeam: null,
          };
        } else {
          return {
            pagerdutyService: service,
            incidentioTeam: null,
          };
        }
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
function displayMonitorDetails(
  monitors: DatadogMonitor[],
  providerSource: string,
  providerName: string,
): void {
  console.log(kleur.bold("\nMonitor Details:"));

  // Display each monitor's tags first
  console.log(kleur.bold("\nMonitor Tags:"));
  monitors.forEach((monitor) => {
    console.log(`  ${kleur.bold(`#${monitor.id}`)}: ${monitor.name}`);
    console.log(
      `    Tags: ${
        monitor.tags.length > 0 ? monitor.tags.join(", ") : "No tags"
      }`,
    );
  });

  // Get the appropriate regex based on provider
  const providerRegex = getServiceRegexForProvider(providerSource);

  // Group monitors by their notification configuration
  const providerOnly = monitors.filter((monitor) => {
    return (
      monitor.message.match(providerRegex) &&
      !monitor.message.match(/@webhook-incident-io(-\S+)?/g)
    );
  });

  const incidentOnly = monitors.filter((monitor) => {
    return (
      !monitor.message.match(providerRegex) &&
      monitor.message.match(/@webhook-incident-io(-\S+)?/g)
    );
  });

  const both = monitors.filter((monitor) => {
    return (
      monitor.message.match(providerRegex) &&
      monitor.message.match(/@webhook-incident-io(-\S+)?/g)
    );
  });

  const neither = monitors.filter((monitor) => {
    return (
      !monitor.message.match(providerRegex) &&
      !monitor.message.match(/@webhook-incident-io(-\S+)?/g)
    );
  });

  // Display each group
  if (providerOnly.length > 0) {
    console.log(kleur.blue(`\nMonitors using ${providerName} only:`));
    providerOnly.forEach((monitor) => {
      console.log(`  ${kleur.bold(`#${monitor.id}`)}: ${monitor.name}`);
      console.log(`    ${extractMentions(monitor.message, providerRegex)}`);
    });
  }

  if (incidentOnly.length > 0) {
    console.log(kleur.green("\nMonitors using incident.io only:"));
    incidentOnly.forEach((monitor) => {
      console.log(`  ${kleur.bold(`#${monitor.id}`)}: ${monitor.name}`);
      console.log(`    ${extractMentions(monitor.message, providerRegex)}`);
    });
  }

  if (both.length > 0) {
    console.log(
      kleur.yellow(`\nMonitors using both ${providerName} and incident.io:`),
    );
    both.forEach((monitor) => {
      console.log(`  ${kleur.bold(`#${monitor.id}`)}: ${monitor.name}`);
      console.log(`    ${extractMentions(monitor.message, providerRegex)}`);
    });
  }

  if (neither.length > 0) {
    console.log(
      kleur.gray(`\nMonitors using neither ${providerName} nor incident.io:`),
    );
    neither.forEach((monitor) => {
      console.log(`  ${kleur.bold(`#${monitor.id}`)}: ${monitor.name}`);
    });
  }
}

/**
 * Extract and highlight mentions in a message
 */
function extractMentions(message: string, providerRegex: RegExp): string {
  let result = message;

  // Highlight provider mentions
  result = result.replace(
    providerRegex,
    (match) => `${kleur.blue(match)}`,
  );

  // Highlight incident.io webhooks
  result = result.replace(
    /@webhook-incident-io(-\S+)?/g,
    (match) => `${kleur.green(match)}`,
  );

  return result;
}