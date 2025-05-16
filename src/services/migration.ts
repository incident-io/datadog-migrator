import { DatadogService } from "./datadog.ts";
import {
  DatadogMonitor,
  FilterOptions,
  IncidentioConfig,
  MigrationMapping,
  MigrationOptions,
  MigrationType,
} from "../types/index.ts";
import { debug } from "../utils/config.ts";
import kleur from "kleur";
import { getServiceRegexForProvider } from "../utils/regex.ts";

export type MigrationChange = {
  id: number;
  name: string;
  before: string;
  after: string;
  reason?: string;
  tagsBefore?: string[];
  tagsAfter?: string[];
};
export type MigrationValidation = {
  valid: boolean;
  unmappedServices: string[];
  nullMappings: string[];
  invalidTeamNames?: string[];
};
export type MigrationResult = {
  processed: number;
  updated: number;
  unchanged: number;
  changes: MigrationChange[];
  errors: { id: number; error: string }[];
  validationResults?: MigrationValidation;
};

export class MigrationService {
  private datadogService: DatadogService;
  private incidentioConfig: IncidentioConfig;
  private mappings: MigrationMapping[];
  private dryRun: boolean;

  // Keep track of webhooks we've already created in this session
  private createdWebhooks: Set<string> = new Set();

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

  private getIncidentioWebhookPattern(): RegExp {
    // Match @webhook-incident-io or @webhook-incident-io-team-name with variations
    return /@webhook-incident-io(?:-[a-zA-Z0-9_-]+)*/g;
  }

  /**
   * Find service mentions in the message based on the configured provider
   * Works with both PagerDuty and Opsgenie
   */
  private findProviderServices(message: string): string[] {
    // Get the regex pattern based on the provider
    const provider = this.incidentioConfig.source || "pagerduty"; // Default to PagerDuty if not specified
    const regex = getServiceRegexForProvider(provider);

    const matches = message.match(regex);
    if (!matches) return [];

    return matches.map((match) => {
      // Extract the service name from @pagerduty-ServiceName or @opsgenie-ServiceName
      const parts = match.split("-");
      return parts.slice(1).join("-");
    });
  }

  /**
   * Legacy method for backward compatibility
   * @deprecated Use findProviderServices instead
   */
  private findPagerDutyServices(message: string): string[] {
    return this.findProviderServices(message);
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

  /**
   * Get the webhook name to use in Datadog configuration (without webhook- prefix)
   */
  private getDatadogWebhookName(team?: string): string {
    if (!this.incidentioConfig.webhookPerTeam || !team) {
      return "incident-io";
    }
    return `incident-io-${team}`;
  }

  /**
   * Get the webhook name to use in monitor messages (with @webhook- prefix)
   */
  private getWebhookNameForTeam(team?: string): string {
    if (!this.incidentioConfig.webhookPerTeam || !team) {
      debug(`Using default webhook: webhook-incident-io`);
      return "webhook-incident-io";
    }

    const webhookName = `webhook-incident-io-${team}`;
    debug(`Generated webhook name for team "${team}": ${webhookName}`);
    return webhookName;
  }

  private getTeamForProviderService(service: string): string | undefined {
    const provider = this.incidentioConfig.source || "pagerduty"; // Default to PagerDuty if not specified
    
    // Find mapping based on provider
    const mapping = this.mappings.find((m) => 
      provider === "opsgenie" 
        ? m.opsgenieService === service 
        : m.pagerdutyService === service
    );
    
    debug(
      `Looking up team for ${provider} service "${service}": ${
        mapping?.incidentioTeam ?? "not found"
      }`,
    );
    return mapping?.incidentioTeam ?? undefined;
  }

  /**
   * Legacy method for backward compatibility
   * @deprecated Use getTeamForProviderService instead
   */
  private getTeamForPagerDutyService(service: string): string | undefined {
    return this.getTeamForProviderService(service);
  }

  private getMappingForService(service: string): MigrationMapping {
    const provider = this.incidentioConfig.source || "pagerduty";
    
    if (provider === "opsgenie") {
      return this.mappings.find((m) => m.opsgenieService === service) ||
        { opsgenieService: service };
    } else {
      return this.mappings.find((m) => m.pagerdutyService === service) ||
        { pagerdutyService: service };
    }
  }

  /**
   * Create a team tag based on the config prefix and team name
   */
  private createTeamTag(team: string): string {
    const prefix = this.incidentioConfig.teamTagPrefix || "team";
    return `${prefix}:${team}`;
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
        if (
          !monitor.tags.some((tag: string) => filterOptions.tags!.includes(tag))
        ) {
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
   * Validate that all provider services (PagerDuty or Opsgenie) have mappings
   */
  private validateProviderMappings(
    monitors: DatadogMonitor[],
  ): MigrationValidation {
    const servicesInMonitors = new Set<string>();
    const provider = this.incidentioConfig.source || "pagerduty"; // Default to PagerDuty if not specified
    const regex = getServiceRegexForProvider(provider);

    // Find all unique provider services in monitors
    for (const monitor of monitors) {
      const serviceMatches = monitor.message.match(regex);

      if (serviceMatches) {
        for (const match of serviceMatches) {
          const parts = match.split("-");
          const service = parts.slice(1).join("-");
          servicesInMonitors.add(service);
        }
      }
    }

    // Check if all services have valid mappings
    const mappedServices = new Map<string, string | null | undefined>(
      this.mappings
        .filter((m) => provider === "opsgenie" ? m.opsgenieService : m.pagerdutyService)
        .map((m) => [
          provider === "opsgenie" 
            ? m.opsgenieService as string 
            : m.pagerdutyService as string, 
          m.incidentioTeam
        ]),
    );

    const unmappedServices: string[] = [];
    const nullMappings: string[] = [];
    const invalidTeamNames: Record<string, string> = {};

    // Define some known team name formats
    // In a real implementation, this might be fetched from incident.io API
    const validTeamNamePattern = /^[a-z0-9-]+$/; // Lowercase alphanumeric with hyphens

    for (const service of servicesInMonitors) {
      if (!mappedServices.has(service)) {
        unmappedServices.push(service);
      } else if (mappedServices.get(service) === null) {
        nullMappings.push(service);
      } else if (
        this.incidentioConfig.webhookPerTeam ||
        this.incidentioConfig.addTeamTags
      ) {
        // Validate team name format if using team-specific webhooks or adding team tags
        const teamName = mappedServices.get(service);
        if (teamName && !validTeamNamePattern.test(teamName)) {
          invalidTeamNames[service] = teamName;
        }
      }
    }

    // Team mappings are required in two scenarios:
    // 1. When using team-specific webhooks
    // 2. When using a single webhook but with addTeamTags enabled
    const requireTeamMappings = this.incidentioConfig.webhookPerTeam ||
      this.incidentioConfig.addTeamTags === true;

    // For validation to pass:
    // - No unmapped services (always required)
    // - If team mappings are required, we also need:
    //   - No null mappings
    //   - No invalid team names
    const valid = unmappedServices.length === 0 &&
      (!requireTeamMappings ||
        (nullMappings.length === 0 &&
          Object.keys(invalidTeamNames).length === 0));

    return {
      valid,
      unmappedServices,
      nullMappings,
      invalidTeamNames: Object.entries(invalidTeamNames).map(
        ([service, team]) => `${service} → "${team}"`,
      ),
    };
  }

  async migrateMonitors(options: MigrationOptions): Promise<MigrationResult> {
    // Get all monitors
    const allMonitors = await this.datadogService.getMonitors();

    // Apply filters if provided
    const monitors = options.filter
      ? this.filterMonitors(allMonitors, options.filter)
      : allMonitors;

    // Always validate mappings for add-incidentio
    let validationResults;
    if (options.type === MigrationType.ADD_INCIDENTIO_WEBHOOK) {
      validationResults = this.validateProviderMappings(monitors);

      // If validation fails, and we're not in dry run mode, abort
      if (!validationResults.valid && !options.dryRun) {
        if (validationResults.unmappedServices.length > 0) {
          const provider = this.incidentioConfig.source || "pagerduty";
          const providerName = provider === "opsgenie" ? "Opsgenie" : "PagerDuty";
          throw new Error(
            `Missing mappings for ${providerName} services: ${
              validationResults.unmappedServices.join(", ")
            }\n\n` +
              `Please add these services to your config file before migrating.`,
          );
        }

        // Both webhook-per-team and addTeamTags scenarios require proper team assignments
        const requiresTeamMappings = this.incidentioConfig.webhookPerTeam ||
          this.incidentioConfig.addTeamTags;

        if (validationResults.nullMappings.length > 0 && requiresTeamMappings) {
          const contextMessage = this.incidentioConfig.webhookPerTeam
            ? "When using team-specific webhooks"
            : "When adding team tags based on mappings";

          const provider = this.incidentioConfig.source || "pagerduty";
          const providerName = provider === "opsgenie" ? "Opsgenie" : "PagerDuty";
          throw new Error(
            `${contextMessage}, all ${providerName} services must have team assignments.\n` +
              `Missing team assignments for: ${
                validationResults.nullMappings.join(", ")
              }\n\n` +
              `Please edit your config file to assign incident.io teams to these ${providerName} services before migrating.\n`,
          );
        }

        if (
          validationResults.invalidTeamNames &&
          validationResults.invalidTeamNames.length > 0 &&
          requiresTeamMappings
        ) {
          const contextMessage = this.incidentioConfig.webhookPerTeam
            ? "When using team-specific webhooks"
            : "When adding team tags based on mappings";

          const provider = this.incidentioConfig.source || "pagerduty";
          const providerName = provider === "opsgenie" ? "Opsgenie" : "PagerDuty";
          throw new Error(
            `${contextMessage}, team names must be in a valid format (lowercase alphanumeric with hyphens).\n` +
              `Invalid team names for services:\n${
                validationResults.invalidTeamNames.join("\n")
              }\n\n` +
              `Please edit your config file to use valid team names for these ${providerName} services.\n`,
          );
        }
      }
    }

    let processed = 0;
    let updated = 0;
    let unchanged = 0;
    const changes: MigrationChange[] = [];
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
            tagsBefore: result.tagsBefore,
            tagsAfter: result.tagsAfter,
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

  /**
   * Create a webhook in Datadog if it doesn't already exist
   * @param webhookName The name of the webhook to create (without @ prefix)
   * @param team Optional team name to include in payload
   * @returns true if successful, false if failed or skipped
   */
  private async ensureWebhookExists(
    webhookName: string,
    team?: string,
    additionalMetadata?: Record<string, string>,
  ): Promise<boolean> {
    if (this.dryRun) {
      debug(`Dry run: Skipping webhook creation for ${webhookName}`);
      return true;
    }

    // Get the actual Datadog webhook name (without the webhook- prefix)
    const datadogWebhookName = this.getDatadogWebhookName(team);

    // Skip if we've already created this webhook in this session
    if (this.createdWebhooks.has(datadogWebhookName)) {
      debug(
        `Webhook ${datadogWebhookName} was already created in this session`,
      );
      return true;
    }

    // Check if webhook already exists
    try {
      const webhook = await this.datadogService.getWebhook(datadogWebhookName);
      if (webhook) {
        debug(`Webhook ${datadogWebhookName} already exists`);
        this.createdWebhooks.add(datadogWebhookName);
        return true;
      }

      // Webhook doesn't exist - check if we have URL and token
      if (
        !this.incidentioConfig.webhookUrl ||
        !this.incidentioConfig.webhookToken
      ) {
        debug(
          `Missing webhook URL or token, cannot create webhook ${datadogWebhookName}`,
        );
        if (!this.incidentioConfig.webhookToken) {
          console.log(
            kleur.yellow(
              `\nMissing incident.io webhook token. You can either:
- Add it to your config file under incidentioConfig.webhookToken, or
- Set it in your .env file as INCIDENTIO_WEBHOOK_TOKEN to avoid storing it in your config`,
            ),
          );
        }
        return false;
      }

      // Standard Datadog webhook payload
      let payload = `{
  "alert_transition": "$ALERT_TRANSITION",
  "deduplication_key": "$AGGREG_KEY-$ALERT_CYCLE_KEY",
  "title": "$EVENT_TITLE",
  "description": "$EVENT_MSG",
  "source_url": "$LINK",
  "metadata": {
      "id": "$ID",
      "alert_metric": "$ALERT_METRIC",
      "alert_query": "$ALERT_QUERY",
      "alert_scope": "$ALERT_SCOPE",
      "alert_status": "$ALERT_STATUS",
      "alert_title": "$ALERT_TITLE",
      "alert_type": "$ALERT_TYPE",
      "alert_url": "$LINK",
      "alert_priority": "$ALERT_PRIORITY",
      "date": "$DATE",
      "event_type": "$EVENT_TYPE",
      "hostname": "$HOSTNAME",
      "last_updated": "$LAST_UPDATED",
      "logs_sample": $LOGS_SAMPLE,
      "org": {
          "id": "$ORG_ID",
          "name": "$ORG_NAME"
      },
      "snapshot_url": "$SNAPSHOT",
      "tags": "$TAGS"`;

      // Add team field if provided
      if (team) {
        payload += `,
      "team": "${team}"`;
      }

      // Add additional metadata fields if provided
      if (additionalMetadata) {
        for (const [key, value] of Object.entries(additionalMetadata)) {
          payload += `,
      "${key}": "${value}"`;
        }
      }

      // Close the JSON
      payload += `
  }
}`;

      // Create the webhook
      await this.datadogService.createWebhook({
        name: datadogWebhookName,
        url: this.incidentioConfig.webhookUrl,
        payload,
        customHeaders: this.incidentioConfig.webhookToken,
      });

      debug(`Created webhook ${datadogWebhookName}`);
      this.createdWebhooks.add(datadogWebhookName);
      return true;
    } catch (error) {
      debug(`Error creating webhook ${webhookName}: ${String(error)}`);
      return false;
    }
  }

  async processMonitor(
    monitor: DatadogMonitor,
    options: MigrationOptions,
  ): Promise<{
    updated: boolean;
    message?: string;
    reason?: string;
    tagsBefore?: string[];
    tagsAfter?: string[];
  }> {
    const { message } = monitor;
    let newMessage = message;
    let updated = false;
    let tagsBefore: string[] | undefined;
    let tagsAfter: string[] | undefined;

    // Use the dryRun flag from options, overriding the constructor value
    const dryRun = options.dryRun !== undefined ? options.dryRun : this.dryRun;
    debug(`Process monitor ${monitor.id} with dryRun=${dryRun}`);
    debug(`Monitor message: "${message}"`);

    const provider = this.incidentioConfig.source || "pagerduty"; // Default to PagerDuty if not specified

    switch (options.type) {
      case MigrationType.ADD_INCIDENTIO_WEBHOOK:
        const providerServices = this.findProviderServices(message);
        debug(
          `Found ${provider} services in monitor ${monitor.id}: ${
            JSON.stringify(providerServices)
          }`,
        );

        if (providerServices.length === 0) {
          debug(`No ${provider} services found in monitor ${monitor.id}`);
          return {
            updated: false,
            message: newMessage,
            reason: `No ${provider} services found`,
            tagsBefore,
            tagsAfter,
          };
        }

        // Check for existing incident.io webhooks
        const existingWebhooks = this.findIncidentioWebhooks(message);
        debug(
          `Found existing webhooks in monitor ${monitor.id}: ${
            JSON.stringify(existingWebhooks)
          }`,
        );

        if (!options.webhookPerTeam) {
          // Use default webhook for all
          const webhookName = this.getWebhookNameForTeam();

          // Create the webhook if needed
          if (!dryRun) {
            // For single webhook strategy, we don't include metadata in the webhook itself
            // Instead, we'll add metadata as tags to the monitors
            const webhookExists = await this.ensureWebhookExists(webhookName);
            if (!webhookExists) {
              return {
                updated: false,
                message: newMessage,
                reason: "Failed to create required webhook",
                tagsBefore,
                tagsAfter,
              };
            }
          }

          // Check if we need to add team tags or metadata tags when using single webhook
          if (
            (!this.incidentioConfig.webhookPerTeam) &&
            (this.incidentioConfig.addTeamTags ||
              providerServices.some((service) => {
                const mapping = this.getMappingForService(service);
                return mapping.additionalMetadata &&
                  Object.keys(mapping.additionalMetadata).length > 0;
              }))
          ) {
            let tagsUpdated = false;
            tagsBefore = [...monitor.tags]; // Store original tags
            const monitorTags = [...monitor.tags]; // Clone the tags array

            // Add team tags for each service in the monitor
            for (const service of providerServices) {
              const mapping = this.getMappingForService(service);
              const team = mapping.incidentioTeam;

              // Add team tags if enabled
              if (this.incidentioConfig.addTeamTags && team) {
                const teamTag = this.createTeamTag(team);
                if (!monitorTags.includes(teamTag)) {
                  monitorTags.push(teamTag);
                  tagsUpdated = true;
                  debug(`Adding tag ${teamTag} to monitor ${monitor.id}`);
                }
              }

              // Always add additional metadata as tags if present
              if (mapping.additionalMetadata) {
                for (
                  const [key, value] of Object.entries(
                    mapping.additionalMetadata,
                  )
                ) {
                  const metadataTag = `${key}:${value}`;
                  if (!monitorTags.includes(metadataTag)) {
                    monitorTags.push(metadataTag);
                    tagsUpdated = true;
                    debug(
                      `Adding metadata tag ${metadataTag} to monitor ${monitor.id}`,
                    );
                  }
                }
              }
            }

            if (tagsUpdated) {
              tagsAfter = monitorTags; // Store the updated tags
              updated = true; // Mark as updated even if message doesn't change
            }
          }

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
                tagsBefore,
                tagsAfter,
              };
            }
          } else {
            // No existing webhook, add the new one
            debug(
              `Adding default webhook @${webhookName} to monitor ${monitor.id}`,
            );
            newMessage = `${message} @${webhookName}`;
            updated = true;
          }
        } else {
          // Team-specific webhooks
          debug(`Using team-specific webhooks for monitor ${monitor.id}`);

          // Calculate expected webhooks based on mappings
          const expectedWebhooks = new Set<string>();
          for (const service of providerServices) {
            const mapping = this.mappings.find((m) =>
              m.pagerdutyService === service
            );
            const team = mapping?.incidentioTeam ?? undefined;
            const webhookName = this.getWebhookNameForTeam(team);

            // Create team-specific webhook if needed
            if (!dryRun) {
              const webhookCreated = await this.ensureWebhookExists(
                webhookName,
                team,
                mapping?.additionalMetadata, // Pass the additional metadata
              );
              if (!webhookCreated) {
                return {
                  updated: false,
                  message: newMessage,
                  reason: `Failed to create required webhook for team ${
                    team || "unknown"
                  }`,
                  tagsBefore,
                  tagsAfter,
                };
              }
            }

            expectedWebhooks.add(`@${webhookName}`);
          }

          debug(
            `Expected webhooks for monitor ${monitor.id}: ${
              [...expectedWebhooks].join(", ")
            }`,
          );

          // Check if existing webhooks match expected ones
          const existingWebhooksSet = new Set(existingWebhooks);
          const needsUpdate = existingWebhooks.length === 0 || // No webhooks yet
            existingWebhooksSet.size !== expectedWebhooks.size || // Different number of webhooks
            ![...expectedWebhooks].every((webhook) =>
              existingWebhooksSet.has(webhook)
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
              tagsBefore,
              tagsAfter,
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
            tagsBefore,
            tagsAfter,
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
        const serviceRegex = getServiceRegexForProvider(provider);
        const services = this.findProviderServices(message);

        if (services.length === 0) {
          return {
            updated: false,
            message: newMessage,
            reason: `No ${provider} services found`,
            tagsBefore,
            tagsAfter,
          };
        }

        newMessage = newMessage
          .replace(serviceRegex, "")
          .replace(/\s+/g, " ")
          .trim();
        updated = true;
        break;
    }

    debug(`Updated: ${updated}, DryRun: ${dryRun}`);

    if (updated && !dryRun) {
      const debugMessage = tagsAfter
        ? `EXECUTING UPDATE - Attempting to update monitor ${monitor.id} with message: "${newMessage}" and tags: ${
          JSON.stringify(tagsAfter)
        }`
        : `EXECUTING UPDATE - Attempting to update monitor ${monitor.id} with message: "${newMessage}"`;
      debug(debugMessage);
      try {
        // Prepare update payload with message and potentially tags
        const updatePayload: Partial<DatadogMonitor> = { message: newMessage };

        // Include tags in the update if they were modified
        if (tagsAfter) {
          updatePayload.tags = tagsAfter;
        }

        const updatedMonitor = await this.datadogService.updateMonitor(
          monitor.id,
          updatePayload,
        );
        debug(
          `Successfully updated monitor ${monitor.id} - Response ID: ${updatedMonitor.id}`,
        );
        const updateDescriptor = tagsAfter ? "message and tags" : "message";
        console.log(
          `Successfully updated monitor ${monitor.id} (${monitor.name}) - ${updateDescriptor}`,
        );
      } catch (error) {
        debug(
          `CRITICAL ERROR - Failed to update monitor ${monitor.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        console.error(
          `Failed to update monitor ${monitor.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        // Return false to indicate the update failed
        return {
          updated: false,
          message: message,
          reason: `API update failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          tagsBefore,
          tagsAfter,
        };
      }
    } else if (updated && dryRun) {
      debug(`Skipping update of monitor ${monitor.id} (dry run mode)`);
    }

    return {
      updated,
      message: newMessage,
      tagsBefore,
      tagsAfter,
    };
  }
}
