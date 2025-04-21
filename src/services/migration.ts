import { DatadogService } from "./datadog";
import {
  DatadogMonitor,
  MigrationMapping,
  MigrationType,
  MigrationOptions,
  IncidentioConfig,
  FilterOptions,
} from "../types";
import { debug } from "../utils/config";

export class MigrationService {
  private datadogService: DatadogService;
  private incidentioConfig: IncidentioConfig;
  private mappings: MigrationMapping[];
  private dryRun: boolean;

  constructor(
    datadogService: DatadogService,
    incidentioConfig: IncidentioConfig,
    mappings: MigrationMapping[] = [],
    options: { dryRun?: boolean } = {},
  ) {
    this.datadogService = datadogService;
    this.incidentioConfig = incidentioConfig;
    this.mappings = mappings;
    this.dryRun = options.dryRun || false;
  }

  private getPagerDutyPattern(): RegExp {
    // Match @pagerduty-ServiceName
    return /@pagerduty-(\S+)/g;
  }

  private getIncidentioWebhookPattern(): RegExp {
    // Match @webhook-incident-io or @webhook-incident-io-team-name with variations
    return /@webhook-incident-io(?:-[a-zA-Z0-9_-]+)*/g;
  }

  private findPagerDutyServices(message: string): string[] {
    const matches = message.match(this.getPagerDutyPattern());
    if (!matches) return [];

    return matches.map((match) => {
      // Extract the service name from @pagerduty-ServiceName
      const parts = match.split("-");
      return parts.slice(1).join("-");
    });
  }

  private findIncidentioWebhooks(message: string): string[] {
    // Find all webhook mentions in the message
    const pattern = this.getIncidentioWebhookPattern();
    const allMatches = [];
    let match;

    // Use exec in a loop to find all matches with their exact text
    while ((match = pattern.exec(message)) !== null) {
      allMatches.push(match[0]); // Get the full match, including the @ symbol
    }

    return allMatches;
  }

  private getWebhookNameForTeam(team?: string): string {
    if (!team && this.incidentioConfig.defaultWebhook) {
      debug(`Using default webhook: ${this.incidentioConfig.defaultWebhook}`);
      return this.incidentioConfig.defaultWebhook;
    }

    if (!team) {
      debug(`No team specified, using fallback webhook: webhook-incident-io`);
      return "webhook-incident-io";
    }

    const webhookName = this.incidentioConfig.webhookNameFormat.replace(
      "{team}",
      team,
    );
    debug(`Generated webhook name for team "${team}": ${webhookName}`);
    return webhookName;
  }

  private getTeamForPagerDutyService(service: string): string | undefined {
    const mapping = this.mappings.find((m) => m.pagerdutyService === service);
    debug(
      `Looking up team for PagerDuty service "${service}": ${mapping?.incidentioTeam ?? "not found"}`,
    );
    return mapping?.incidentioTeam ?? undefined;
  }

  /**
   * Filter monitors based on provided filter options
   */
  private filterMonitors(
    monitors: DatadogMonitor[],
    filterOptions?: FilterOptions,
  ): DatadogMonitor[] {
    if (!filterOptions) return monitors;

    return monitors.filter((monitor) => {
      // Filter by tags
      if (filterOptions.tags && filterOptions.tags.length > 0) {
        if (!monitor.tags.some((tag) => filterOptions.tags!.includes(tag))) {
          return false;
        }
      }

      // Filter by name pattern
      if (
        filterOptions.namePattern &&
        !filterOptions.namePattern.test(monitor.name)
      ) {
        return false;
      }

      // Filter by message pattern
      if (
        filterOptions.messagePattern &&
        !filterOptions.messagePattern.test(monitor.message)
      ) {
        return false;
      }

      return true;
    });
  }

  /**
   * Validate that all PagerDuty services have mappings
   */
  private validatePagerDutyMappings(monitors: DatadogMonitor[]): {
    valid: boolean;
    unmappedServices: string[];
    nullMappings: string[];
  } {
    const servicesInMonitors = new Set<string>();
    const pdPattern = this.getPagerDutyPattern();

    // Find all unique PagerDuty services in monitors
    for (const monitor of monitors) {
      const pdMatches = monitor.message.match(pdPattern);

      if (pdMatches) {
        for (const match of pdMatches) {
          const parts = match.split("-");
          const service = parts.slice(1).join("-");
          servicesInMonitors.add(service);
        }
      }
    }

    // Check if all services have valid mappings
    const mappedServices = new Map<string, string | null | undefined>(
      this.mappings
        .filter((m) => m.pagerdutyService)
        .map((m) => [m.pagerdutyService as string, m.incidentioTeam]),
    );

    const unmappedServices: string[] = [];
    const nullMappings: string[] = [];

    for (const service of servicesInMonitors) {
      if (!mappedServices.has(service)) {
        unmappedServices.push(service);
      } else if (mappedServices.get(service) === null) {
        nullMappings.push(service);
      }
    }

    return {
      valid: unmappedServices.length === 0 && nullMappings.length === 0,
      unmappedServices,
      nullMappings,
    };
  }

  async migrateMonitors(options: MigrationOptions): Promise<{
    processed: number;
    updated: number;
    unchanged: number;
    changes: {
      id: number;
      name: string;
      before: string;
      after: string;
      reason?: string;
    }[];
    errors: { id: number; error: string }[];
    validationResults?: {
      valid: boolean;
      unmappedServices: string[];
      nullMappings: string[];
    };
  }> {
    // Get all monitors
    const allMonitors = await this.datadogService.getMonitors();

    // Apply filters if provided
    const monitors = options.filter
      ? this.filterMonitors(allMonitors, options.filter)
      : allMonitors;

    // Validate mappings if requested
    let validationResults;
    if (
      options.validateMappings &&
      options.type === MigrationType.ADD_INCIDENTIO_WEBHOOK
    ) {
      validationResults = this.validatePagerDutyMappings(monitors);

      // If validation fails, and we're not in dry run mode, abort
      if (!validationResults.valid && !options.dryRun) {
        if (validationResults.unmappedServices.length > 0) {
          throw new Error(
            `Missing mappings for PagerDuty services: ${validationResults.unmappedServices.join(", ")}`,
          );
        }

        if (validationResults.nullMappings.length > 0) {
          throw new Error(
            `Incomplete mappings (null incidentioTeam values) for PagerDuty services: ${validationResults.nullMappings.join(", ")}\n` +
              `Please edit your mapping file to provide team names for these services.`,
          );
        }
      }
    }

    let processed = 0;
    let updated = 0;
    let unchanged = 0;
    const changes: {
      id: number;
      name: string;
      before: string;
      after: string;
      reason?: string;
    }[] = [];
    const errors: { id: number; error: string }[] = [];

    for (const monitor of monitors) {
      try {
        const result = await this.processMonitor(monitor, options);
        processed++;

        if (result.updated) {
          updated++;
          changes.push({
            id: monitor.id,
            name: monitor.name,
            before: monitor.message,
            after: result.message || monitor.message,
          });
        } else {
          unchanged++;
          if (options.verbose) {
            changes.push({
              id: monitor.id,
              name: monitor.name,
              before: monitor.message,
              after: monitor.message,
              reason: result.reason,
            });
          }
        }
      } catch (error) {
        errors.push({
          id: monitor.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      processed,
      updated,
      unchanged,
      changes,
      errors,
      validationResults,
    };
  }

  async processMonitor(
    monitor: DatadogMonitor,
    options: MigrationOptions,
  ): Promise<{
    updated: boolean;
    message?: string;
    reason?: string;
  }> {
    const { message } = monitor;
    let newMessage = message;
    let updated = false;

    // Use the dryRun flag from options, overriding the constructor value
    const dryRun = options.dryRun !== undefined ? options.dryRun : this.dryRun;
    debug(`Process monitor ${monitor.id} with dryRun=${dryRun}`);
    debug(`Monitor message: "${message}"`);

    switch (options.type) {
      case MigrationType.ADD_INCIDENTIO_WEBHOOK:
        const pagerDutyServices = this.findPagerDutyServices(message);
        debug(
          `Found PagerDuty services in monitor ${monitor.id}: ${JSON.stringify(pagerDutyServices)}`,
        );

        if (pagerDutyServices.length === 0) {
          debug(`No PagerDuty services found in monitor ${monitor.id}`);
          return {
            updated: false,
            message: newMessage,
            reason: "No PagerDuty services found",
          };
        }

        // Check for existing incident.io webhooks
        const existingWebhooks = this.findIncidentioWebhooks(message);
        debug(
          `Found existing webhooks in monitor ${monitor.id}: ${JSON.stringify(existingWebhooks)}`,
        );

        if (options.singleWebhook) {
          // Use default webhook for all
          const webhookName = this.getWebhookNameForTeam();

          // If there's an existing webhook but it doesn't match the expected one, replace it
          if (existingWebhooks.length > 0) {
            if (
              !existingWebhooks.some((webhook) => webhook === `@${webhookName}`)
            ) {
              // Replace existing webhooks with the correct one
              for (const webhook of existingWebhooks) {
                newMessage = newMessage
                  .replace(webhook, "")
                  .replace(/\s+/g, " ")
                  .trim();
              }
              newMessage = `${newMessage} @${webhookName}`;
              updated = true;
            } else {
              return {
                updated: false,
                message: newMessage,
                reason: "Already has correct incident.io webhook",
              };
            }
          }

          // No existing webhook, add the new one
          debug(
            `Adding default webhook @${webhookName} to monitor ${monitor.id}`,
          );
          newMessage = `${message} @${webhookName}`;
          updated = true;
        } else {
          // Team-specific webhooks
          debug(`Using team-specific webhooks for monitor ${monitor.id}`);

          // Calculate expected webhooks based on mappings
          const expectedWebhooks = new Set<string>();
          for (const service of pagerDutyServices) {
            const team = this.getTeamForPagerDutyService(service);
            const webhookName = this.getWebhookNameForTeam(team);
            expectedWebhooks.add(`@${webhookName}`);
          }

          debug(
            `Expected webhooks for monitor ${monitor.id}: ${[...expectedWebhooks].join(", ")}`,
          );

          // Check if existing webhooks match expected ones
          const existingWebhooksSet = new Set(existingWebhooks);
          const needsUpdate =
            existingWebhooks.length === 0 || // No webhooks yet
            existingWebhooksSet.size !== expectedWebhooks.size || // Different number of webhooks
            ![...expectedWebhooks].every((webhook) =>
              existingWebhooksSet.has(webhook),
            ); // Different webhooks

          if (needsUpdate) {
            // Remove existing webhooks if any
            for (const webhook of existingWebhooks) {
              newMessage = newMessage
                .replace(webhook, "")
                .replace(/\s+/g, " ")
                .trim();
            }

            // Add all expected webhooks
            for (const webhook of expectedWebhooks) {
              newMessage = `${newMessage} ${webhook}`;
            }

            updated = true;
          } else {
            debug(
              `Monitor ${monitor.id} already has all correct incident.io webhooks`,
            );
            return {
              updated: false,
              message: newMessage,
              reason: "Already has all correct incident.io webhooks",
            };
          }
        }
        break;

      case MigrationType.REMOVE_INCIDENTIO_WEBHOOK:
        const incidentWebhooks = this.findIncidentioWebhooks(message);

        if (incidentWebhooks.length === 0) {
          return {
            updated: false,
            message: newMessage,
            reason: "No incident.io webhooks found",
          };
        }

        for (const webhook of incidentWebhooks) {
          newMessage = newMessage
            .replace(webhook, "")
            .replace(/\s+/g, " ")
            .trim();
          updated = true;
        }
        break;

      case MigrationType.REMOVE_PAGERDUTY:
        const pdServices = this.findPagerDutyServices(message);

        if (pdServices.length === 0) {
          return {
            updated: false,
            message: newMessage,
            reason: "No PagerDuty services found",
          };
        }

        const pdPattern = this.getPagerDutyPattern();
        newMessage = newMessage
          .replace(pdPattern, "")
          .replace(/\s+/g, " ")
          .trim();
        updated = true;
        break;
    }

    debug(`Updated: ${updated}, DryRun: ${dryRun}`);

    if (updated && !dryRun) {
      debug(
        `EXECUTING UPDATE - Attempting to update monitor ${monitor.id} with message: "${newMessage}"`,
      );
      try {
        const updatedMonitor = await this.datadogService.updateMonitor(
          monitor.id,
          { message: newMessage },
        );
        debug(
          `Successfully updated monitor ${monitor.id} - Response ID: ${updatedMonitor.id}`,
        );
        console.log(
          `Successfully updated monitor ${monitor.id} (${monitor.name})`,
        );
      } catch (error) {
        debug(
          `CRITICAL ERROR - Failed to update monitor ${monitor.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        console.error(
          `Failed to update monitor ${monitor.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Return false to indicate the update failed
        return {
          updated: false,
          message: message,
          reason: `API update failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    } else if (updated && dryRun) {
      debug(`Skipping update of monitor ${monitor.id} (dry run mode)`);
    }

    return { updated, message: newMessage };
  }
}
