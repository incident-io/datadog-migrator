/**
 * Test utilities and mock data for tests
 */

import { DatadogMonitor, IncidentioConfig, MigrationMapping } from "../../types/index.ts";

/**
 * Creates a test monitor with the specified properties
 */
export function createTestMonitor(
  overrides: Partial<DatadogMonitor> = {}
): DatadogMonitor {
  return {
    id: overrides.id ?? 12345,
    name: overrides.name ?? "Test Monitor",
    message: overrides.message ?? "Alert message",
    tags: overrides.tags ?? [],
  };
}

/**
 * Creates a monitor with PagerDuty service mentions
 */
export function createPagerDutyMonitor(
  serviceName: string,
  overrides: Partial<DatadogMonitor> = {}
): DatadogMonitor {
  return createTestMonitor({
    ...overrides,
    message: `Alert: Something is wrong! @pagerduty-${serviceName} Please fix it.`,
  });
}

/**
 * Creates a monitor with Opsgenie service mentions
 */
export function createOpsgenieMonitor(
  serviceName: string,
  overrides: Partial<DatadogMonitor> = {}
): DatadogMonitor {
  return createTestMonitor({
    ...overrides,
    message: `Alert: Something is wrong! @opsgenie-${serviceName} Please fix it.`,
  });
}

/**
 * Creates a monitor with incident.io webhooks
 */
export function createIncidentioMonitor(
  team?: string,
  overrides: Partial<DatadogMonitor> = {}
): DatadogMonitor {
  const webhookName = team ? `webhook-incident-io-${team}` : "webhook-incident-io";
  return createTestMonitor({
    ...overrides,
    message: `Alert: Something is wrong! @${webhookName} Please fix it.`,
  });
}

/**
 * Creates a monitor with both provider service and incident.io webhook
 */
export function createMixedMonitor(
  providerType: "pagerduty" | "opsgenie",
  serviceName: string,
  team?: string,
  overrides: Partial<DatadogMonitor> = {}
): DatadogMonitor {
  const webhookName = team ? `webhook-incident-io-${team}` : "webhook-incident-io";
  const providerText = providerType === "pagerduty" ? 
    `@pagerduty-${serviceName}` : 
    `@opsgenie-${serviceName}`;
  
  return createTestMonitor({
    ...overrides,
    message: `Alert: Something is wrong! ${providerText} @${webhookName} Please fix it.`,
  });
}

/**
 * Creates a test IncidentioConfig
 */
export function createTestConfig(
  overrides: Partial<IncidentioConfig> = {}
): IncidentioConfig {
  return {
    webhookPerTeam: overrides.webhookPerTeam ?? false,
    webhookUrl: overrides.webhookUrl ?? "https://api.incident.io/v2/alerts/incoming/test",
    webhookToken: overrides.webhookToken ?? "test-token",
    addTeamTags: overrides.addTeamTags ?? false,
    teamTagPrefix: overrides.teamTagPrefix ?? "team",
    source: overrides.source ?? "pagerduty",
  };
}

/**
 * Creates test mapping entries
 */
export function createTestMappings(source: "pagerduty" | "opsgenie" = "pagerduty"): MigrationMapping[] {
  if (source === "pagerduty") {
    return [
      {
        pagerdutyService: "api-critical",
        incidentioTeam: "api-team",
        additionalMetadata: {
          priority: "high",
          service: "api"
        }
      },
      {
        pagerdutyService: "api-non-critical",
        incidentioTeam: "api-team",
        additionalMetadata: {
          priority: "low",
          service: "api"
        }
      },
      {
        pagerdutyService: "database",
        incidentioTeam: "platform-team",
        additionalMetadata: {
          priority: "high",
          service: "database"
        }
      }
    ];
  } else {
    return [
      {
        opsgenieService: "api-critical",
        incidentioTeam: "api-team",
        additionalMetadata: {
          priority: "high",
          service: "api"
        }
      },
      {
        opsgenieService: "api-non-critical",
        incidentioTeam: "api-team",
        additionalMetadata: {
          priority: "low",
          service: "api"
        }
      },
      {
        opsgenieService: "database",
        incidentioTeam: "platform-team",
        additionalMetadata: {
          priority: "high",
          service: "database"
        }
      }
    ];
  }
}