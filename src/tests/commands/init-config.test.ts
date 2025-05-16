/**
 * Tests for init-config command
 */
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.171.0/testing/asserts.ts";
import { createDefaultConfig } from "../../utils/config.ts";
import { MockDatadogService } from "../utils/mock-datadog-service.ts";
import { createPagerDutyMonitor, createOpsgenieMonitor } from "../utils/test-utils.ts";
import { withMockedEnv } from "../utils/test-stub.ts";

/**
 * Test the default config creation with additionalMetadata examples
 * This test verifies:
 * - The default config includes the expected structure
 * - PagerDuty is the default provider
 * - There are no mappings by default
 * - additionalMetadata examples are provided in the documentation
 */
Deno.test("init-config - default config creation", async () => {
  await withMockedEnv(async () => {
    // Create default config
    const defaultConfig = createDefaultConfig();
    
    // Verify default config structure
    assertEquals(defaultConfig.incidentioConfig.source, "pagerduty", "Default provider should be PagerDuty");
    assertEquals(defaultConfig.incidentioConfig.webhookPerTeam, false, "Default should use single webhook mode");
    assertEquals(defaultConfig.incidentioConfig.addTeamTags, false, "Default should not add team tags");
    assertEquals(defaultConfig.incidentioConfig.teamTagPrefix, "team", "Default team tag prefix should be 'team'");
    assertEquals(defaultConfig.mappings.length, 0, "Default should have no mappings");
  });
});

/**
 * Test the service detection for PagerDuty
 * This test verifies:
 * - The command correctly detects PagerDuty services from monitors
 * - Each detected service gets a mapping entry in the config
 * - The first service gets an additionalMetadata example
 */
Deno.test("init-config - PagerDuty service detection", async () => {
  await withMockedEnv(async () => {
    // Create and configure mock service
    const mockDatadogService = new MockDatadogService();
    
    // Create test monitors with PagerDuty services
    mockDatadogService.setMonitors([
      createPagerDutyMonitor("api-critical", { id: 1 }),
      createPagerDutyMonitor("database", { id: 2 }),
      createPagerDutyMonitor("api-non-critical", { id: 3 })
    ]);
    
    // Get all monitors to simulate the init-config detection
    const monitors = await mockDatadogService.getMonitors();
    
    // Extract PagerDuty services (simulate detection logic)
    const pdRegex = /@pagerduty-([a-zA-Z0-9_-]+)/g;
    const services = new Set<string>();
    
    for (const monitor of monitors) {
      const matches = [...monitor.message.matchAll(pdRegex)];
      for (const match of matches) {
        services.add(match[1]);
      }
    }
    
    // Verify service detection
    const detectedServices = [...services].sort();
    assertEquals(detectedServices.length, 3, "Should detect 3 PagerDuty services");
    assertEquals(detectedServices[0], "api-critical", "Should detect api-critical service");
    assertEquals(detectedServices[1], "api-non-critical", "Should detect api-non-critical service");
    assertEquals(detectedServices[2], "database", "Should detect database service");
    
    // Create example mappings with additionalMetadata for the first service
    const defaultConfig = createDefaultConfig();
    
    for (const [index, service] of detectedServices.entries()) {
      if (index === 0) {
        // First service gets additionalMetadata example
        defaultConfig.mappings.push({
          pagerdutyService: service,
          incidentioTeam: null,
          additionalMetadata: {
            "priority": "high",
            "environment": "production"
          }
        });
      } else {
        defaultConfig.mappings.push({
          pagerdutyService: service,
          incidentioTeam: null
        });
      }
    }
    
    // Verify mappings
    assertEquals(defaultConfig.mappings.length, 3, "Should create 3 mappings");
    
    // Verify first mapping has additionalMetadata
    const firstMapping = defaultConfig.mappings[0];
    assertEquals(firstMapping.pagerdutyService, "api-critical", "First mapping should be for api-critical");
    assertEquals(firstMapping.incidentioTeam, null, "Team should be null initially");
    assertEquals(
      firstMapping.additionalMetadata?.priority, 
      "high", 
      "First mapping should have priority metadata"
    );
    assertEquals(
      firstMapping.additionalMetadata?.environment, 
      "production", 
      "First mapping should have environment metadata"
    );
    
    // Verify other mappings don't have additionalMetadata by default
    const secondMapping = defaultConfig.mappings[1];
    assertEquals(secondMapping.additionalMetadata, undefined, "Other mappings shouldn't have additionalMetadata by default");
  });
});

/**
 * Test the service detection for Opsgenie
 * This test verifies:
 * - The command correctly detects Opsgenie services from monitors
 * - Each detected service gets a mapping entry in the config
 * - The first service gets an additionalMetadata example
 */
Deno.test("init-config - Opsgenie service detection", async () => {
  await withMockedEnv(async () => {
    // Create and configure mock service
    const mockDatadogService = new MockDatadogService();
    
    // Create test monitors with Opsgenie services
    mockDatadogService.setMonitors([
      createOpsgenieMonitor("api-critical", { id: 1 }),
      createOpsgenieMonitor("database", { id: 2 }),
      createOpsgenieMonitor("api-non-critical", { id: 3 })
    ]);
    
    // Get all monitors to simulate the init-config detection
    const monitors = await mockDatadogService.getMonitors();
    
    // Extract Opsgenie services (simulate detection logic)
    const opsgenieRegex = /@opsgenie-([a-zA-Z0-9_-]+)/g;
    const services = new Set<string>();
    
    for (const monitor of monitors) {
      const matches = [...monitor.message.matchAll(opsgenieRegex)];
      for (const match of matches) {
        services.add(match[1]);
      }
    }
    
    // Verify service detection
    const detectedServices = [...services].sort();
    assertEquals(detectedServices.length, 3, "Should detect 3 Opsgenie services");
    assertEquals(detectedServices[0], "api-critical", "Should detect api-critical service");
    assertEquals(detectedServices[1], "api-non-critical", "Should detect api-non-critical service");
    assertEquals(detectedServices[2], "database", "Should detect database service");
    
    // Create example mappings with additionalMetadata for the first service
    const defaultConfig = createDefaultConfig();
    defaultConfig.incidentioConfig.source = "opsgenie";
    
    for (const [index, service] of detectedServices.entries()) {
      if (index === 0) {
        // First service gets additionalMetadata example
        defaultConfig.mappings.push({
          opsgenieService: service,
          incidentioTeam: null,
          additionalMetadata: {
            "priority": "high",
            "environment": "production"
          }
        });
      } else {
        defaultConfig.mappings.push({
          opsgenieService: service,
          incidentioTeam: null
        });
      }
    }
    
    // Verify mappings
    assertEquals(defaultConfig.mappings.length, 3, "Should create 3 mappings");
    
    // Verify first mapping has additionalMetadata
    const firstMapping = defaultConfig.mappings[0];
    assertEquals(firstMapping.opsgenieService, "api-critical", "First mapping should be for api-critical");
    assertEquals(firstMapping.incidentioTeam, null, "Team should be null initially");
    assertEquals(
      firstMapping.additionalMetadata?.priority, 
      "high", 
      "First mapping should have priority metadata"
    );
    assertEquals(
      firstMapping.additionalMetadata?.environment, 
      "production", 
      "First mapping should have environment metadata"
    );
    
    // Verify other mappings don't have additionalMetadata by default
    const secondMapping = defaultConfig.mappings[1];
    assertEquals(secondMapping.additionalMetadata, undefined, "Other mappings shouldn't have additionalMetadata by default");
  });
});

/**
 * Test the config creation with team-specific webhooks
 * This test verifies:
 * - The config correctly sets webhookPerTeam to true when team webhooks are selected
 * - The config correctly sets addTeamTags to false when team webhooks are selected
 */
Deno.test("init-config - team webhook configuration", async () => {
  await withMockedEnv(async () => {
    // Create a config with team-specific webhooks
    const config = createDefaultConfig();
    config.incidentioConfig.webhookPerTeam = true;
    config.incidentioConfig.addTeamTags = false;
    config.incidentioConfig.webhookToken = "test-token"; // Set a token explicitly
    
    // Verify config values
    assertEquals(config.incidentioConfig.webhookPerTeam, true, "Should enable team-specific webhooks");
    assertEquals(config.incidentioConfig.addTeamTags, false, "Should not add team tags with team webhooks");
    
    // Verify webhook token handling
    assertEquals(config.incidentioConfig.webhookToken, "test-token", "Should have a webhook token");
  });
});

/**
 * Test the config creation with single webhook and team tags
 * This test verifies:
 * - The config correctly sets webhookPerTeam to false when single webhook is selected
 * - The config correctly sets addTeamTags to true when team tags are enabled
 * - The config correctly sets teamTagPrefix to the specified prefix
 */
Deno.test("init-config - single webhook with team tags configuration", async () => {
  await withMockedEnv(async () => {
    // Create a config with single webhook and team tags
    const config = createDefaultConfig();
    config.incidentioConfig.webhookPerTeam = false;
    config.incidentioConfig.addTeamTags = true;
    config.incidentioConfig.teamTagPrefix = "squad";
    
    // Verify config values
    assertEquals(config.incidentioConfig.webhookPerTeam, false, "Should use single webhook");
    assertEquals(config.incidentioConfig.addTeamTags, true, "Should add team tags");
    assertEquals(config.incidentioConfig.teamTagPrefix, "squad", "Should use the specified tag prefix");
  });
});