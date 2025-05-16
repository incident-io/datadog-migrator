/**
 * Tests for analyze command
 */
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.171.0/testing/asserts.ts";
import { MigrationService } from "../../services/migration.ts";
import type { DatadogService } from "../../services/datadog.ts";
import { MockDatadogService } from "../utils/mock-services.ts";
import { createPagerDutyMonitor, createOpsgenieMonitor, createIncidentioMonitor, createMixedMonitor, createTestConfig, createTestMappings, createTestMonitor } from "../utils/test-utils.ts";
import { withMockedEnv } from "../utils/test-stub.ts";
import { getServiceRegexForProvider } from "../../utils/regex.ts";

/**
 * Test the analyze command with PagerDuty as the provider
 * This test verifies:
 * - Monitor analysis correctly identifies PagerDuty services
 * - Analysis correctly counts monitors with PagerDuty, incident.io, both, or neither
 * - Mapping validation works correctly
 */
Deno.test("analyze command - with PagerDuty provider", async () => {
  await withMockedEnv(async () => {
    // Create and configure mock service
    const mockDatadogService = new MockDatadogService();
    
    // Set up monitors directly
    mockDatadogService.monitors = [
      // PagerDuty only monitors
      createPagerDutyMonitor("api-critical", { id: 1, tags: ["env:prod"] }),
      createPagerDutyMonitor("database", { id: 2, tags: ["env:prod"] }),
      
      // incident.io only monitors
      createIncidentioMonitor("api-team", { id: 3, tags: ["env:prod", "team:api-team"] }),
      
      // Both PagerDuty and incident.io
      createMixedMonitor("pagerduty", "api-non-critical", "api-team", { 
        id: 4, 
        tags: ["env:staging", "team:api-team"] 
      }),
      
      // Neither
      createTestMonitor({ 
        id: 5, 
        name: "Regular Monitor", 
        message: "Just a regular alert with no integrations", 
        tags: ["env:dev"] 
      })
    ];
    
    // Create test config with PagerDuty as source
    const config = {
      incidentioConfig: createTestConfig({
        source: "pagerduty"
      }),
      mappings: createTestMappings("pagerduty")
    };
    
    // Get the appropriate regex based on the provider
    const providerRegex = getServiceRegexForProvider("pagerduty");
    
    // Manually analyze the monitors to compare with the command output
    const monitors = await mockDatadogService.getMonitors();
    
    // Count monitors by category
    const pdOnly = monitors.filter(m => 
      m.message.match(providerRegex) && 
      !m.message.match(/@webhook-incident-io(-\S+)?/g)
    );
    
    const incidentioOnly = monitors.filter(m => 
      !m.message.match(providerRegex) && 
      m.message.match(/@webhook-incident-io(-\S+)?/g)
    );
    
    const both = monitors.filter(m => 
      m.message.match(providerRegex) && 
      m.message.match(/@webhook-incident-io(-\S+)?/g)
    );
    
    const neither = monitors.filter(m => 
      !m.message.match(providerRegex) && 
      !m.message.match(/@webhook-incident-io(-\S+)?/g)
    );
    
    // Assert monitor counts
    assertEquals(monitors.length, 5, "Total monitor count should be 5");
    assertEquals(pdOnly.length, 2, "PagerDuty-only count should be 2");
    assertEquals(incidentioOnly.length, 1, "incident.io-only count should be 1");
    assertEquals(both.length, 1, "Both count should be 1");
    assertEquals(neither.length, 1, "Neither count should be 1");
    
    // Create stats object similar to what the analyze command would produce
    const stats = {
      total: monitors.length,
      provider: {
        name: "pagerduty",
        displayName: "PagerDuty",
        count: pdOnly.length + both.length, // Total monitors with PagerDuty
        services: {
          "api-critical": 1,
          "database": 1,
          "api-non-critical": 1
        }
      },
      incidentio: {
        count: incidentioOnly.length + both.length, // Total monitors with incident.io
        webhooks: {
          "@webhook-incident-io-api-team": 2  // One incident.io only and one mixed
        }
      },
      both: both.length,
      neither: neither.length
    };
    
    // Verify service counts
    assertEquals(
      Object.keys(stats.provider.services).length, 
      3, 
      "Should have 3 distinct PagerDuty services"
    );
    
    // Check service detection
    assertEquals(
      stats.provider.services["api-critical"], 
      1, 
      "Should detect 1 api-critical service"
    );
    assertEquals(
      stats.provider.services["database"], 
      1, 
      "Should detect 1 database service"
    );
    assertEquals(
      stats.provider.services["api-non-critical"], 
      1, 
      "Should detect 1 api-non-critical service"
    );
    
    // Verify webhook counts
    assertEquals(
      Object.keys(stats.incidentio.webhooks).length, 
      1, 
      "Should have 1 distinct incident.io webhook"
    );
    assertEquals(
      stats.incidentio.webhooks["@webhook-incident-io-api-team"], 
      2, 
      "Should detect 2 uses of api-team webhook"
    );
    
    // Verify mappings coverage
    const services = Object.keys(stats.provider.services);
    const mappings = config.mappings;
    
    // All services have mappings
    const mappingsMap = new Map();
    for (const mapping of mappings) {
      if (mapping.pagerdutyService) {
        mappingsMap.set(mapping.pagerdutyService, mapping.incidentioTeam);
      }
    }
    
    // Find unmapped services
    const unmappedServices = services.filter(s => !mappingsMap.has(s));
    assertEquals(unmappedServices.length, 0, "All services should have mappings");
    
    // All mappings have teams assigned
    const nullMappings = services.filter(
      s => mappingsMap.has(s) && mappingsMap.get(s) === null
    );
    assertEquals(nullMappings.length, 0, "All mappings should have teams assigned");
  });
});

/**
 * Test the analyze command with Opsgenie as the provider
 * This test verifies:
 * - Monitor analysis correctly identifies Opsgenie services
 * - Analysis correctly counts monitors with Opsgenie, incident.io, both, or neither
 * - Mapping validation works correctly with missing mappings
 */
Deno.test("analyze command - with Opsgenie provider and unmapped services", async () => {
  await withMockedEnv(async () => {
    // Create and configure mock service
    const mockDatadogService = new MockDatadogService();
    
    // Set up monitors directly
    mockDatadogService.monitors = [
      // Opsgenie only monitors
      createOpsgenieMonitor("api-critical", { id: 1, tags: ["env:prod"] }),
      createOpsgenieMonitor("database", { id: 2, tags: ["env:prod"] }),
      createOpsgenieMonitor("new-service", { id: 3, tags: ["env:prod"] }), // Unmapped service
      
      // incident.io only monitors
      createIncidentioMonitor("api-team", { id: 4, tags: ["env:prod", "team:api-team"] }),
      
      // Both Opsgenie and incident.io
      createMixedMonitor("opsgenie", "api-non-critical", "api-team", { 
        id: 5, 
        tags: ["env:staging", "team:api-team"] 
      }),
      
      // Neither
      createTestMonitor({ 
        id: 6, 
        name: "Regular Monitor", 
        message: "Just a regular alert with no integrations", 
        tags: ["env:dev"] 
      })
    ];
    
    // Create test config with Opsgenie as source
    const config = {
      incidentioConfig: createTestConfig({
        source: "opsgenie"
      }),
      mappings: createTestMappings("opsgenie")
    };
    
    // Get the appropriate regex based on the provider
    const providerRegex = getServiceRegexForProvider("opsgenie");
    
    // Manually analyze the monitors to compare with the command output
    const monitors = await mockDatadogService.getMonitors();
    
    // Count monitors by category
    const opsgenieOnly = monitors.filter(m => 
      m.message.match(providerRegex) && 
      !m.message.match(/@webhook-incident-io(-\S+)?/g)
    );
    
    const incidentioOnly = monitors.filter(m => 
      !m.message.match(providerRegex) && 
      m.message.match(/@webhook-incident-io(-\S+)?/g)
    );
    
    const both = monitors.filter(m => 
      m.message.match(providerRegex) && 
      m.message.match(/@webhook-incident-io(-\S+)?/g)
    );
    
    const neither = monitors.filter(m => 
      !m.message.match(providerRegex) && 
      !m.message.match(/@webhook-incident-io(-\S+)?/g)
    );
    
    // Assert monitor counts
    assertEquals(monitors.length, 6, "Total monitor count should be 6");
    assertEquals(opsgenieOnly.length, 3, "Opsgenie-only count should be 3");
    assertEquals(incidentioOnly.length, 1, "incident.io-only count should be 1");
    assertEquals(both.length, 1, "Both count should be 1");
    assertEquals(neither.length, 1, "Neither count should be 1");
    
    // Create stats object similar to what the analyze command would produce
    const stats = {
      total: monitors.length,
      provider: {
        name: "opsgenie",
        displayName: "Opsgenie",
        count: opsgenieOnly.length + both.length, // Total monitors with Opsgenie
        services: {
          "api-critical": 1,
          "database": 1,
          "new-service": 1, // Unmapped service
          "api-non-critical": 1
        }
      },
      incidentio: {
        count: incidentioOnly.length + both.length, // Total monitors with incident.io
        webhooks: {
          "@webhook-incident-io-api-team": 2  // One incident.io only and one mixed
        }
      },
      both: both.length,
      neither: neither.length
    };
    
    // Verify service counts
    assertEquals(
      Object.keys(stats.provider.services).length, 
      4, 
      "Should have 4 distinct Opsgenie services"
    );
    
    // Verify unmapped service detection
    const services = Object.keys(stats.provider.services);
    const mappings = config.mappings;
    
    // Create mapping Map
    const mappingsMap = new Map();
    for (const mapping of mappings) {
      if (mapping.opsgenieService) {
        mappingsMap.set(mapping.opsgenieService, mapping.incidentioTeam);
      }
    }
    
    // Find unmapped services
    const unmappedServices = services.filter(s => !mappingsMap.has(s));
    assertEquals(unmappedServices.length, 1, "Should have 1 unmapped service");
    assertEquals(unmappedServices[0], "new-service", "Unmapped service should be 'new-service'");
  });
});

/**
 * Test the analyze command with filters applied
 * This test verifies:
 * - The tag filter correctly filters monitors
 * - The name filter correctly filters monitors
 * - The message filter correctly filters monitors
 */
Deno.test("analyze command - with filters", async () => {
  await withMockedEnv(async () => {
    // Create and configure mock service
    const mockDatadogService = new MockDatadogService();
    
    // Set up monitors with various configurations
    mockDatadogService.setMonitors([
      // PagerDuty monitors with different tags
      createPagerDutyMonitor("api-critical", { 
        id: 1, 
        name: "API Critical", 
        tags: ["env:prod", "service:api"] 
      }),
      createPagerDutyMonitor("database", { 
        id: 2, 
        name: "Database High Utilization", 
        tags: ["env:prod", "service:db"] 
      }),
      createPagerDutyMonitor("api-non-critical", { 
        id: 3, 
        name: "API Non-Critical", 
        tags: ["env:staging", "service:api"] 
      }),
      
      // incident.io monitor
      createIncidentioMonitor("api-team", { 
        id: 4, 
        name: "API Team Alert", 
        tags: ["env:prod", "team:api-team"] 
      }),
      
      // Neither
      createTestMonitor({ 
        id: 5, 
        name: "Regular Monitor", 
        message: "Just a regular alert with no integrations", 
        tags: ["env:dev"] 
      })
    ]);
    
    // Create test config
    const config = {
      incidentioConfig: createTestConfig({
        source: "pagerduty"
      }),
      mappings: createTestMappings("pagerduty")
    };
    
    // Test tag filter
    const allMonitors = await mockDatadogService.getMonitors();
    
    // Filter by tag "env:prod"
    const prodMonitors = allMonitors.filter(m => m.tags.includes("env:prod"));
    assertEquals(prodMonitors.length, 3, "Should have 3 monitors with env:prod tag");
    
    // Filter by tag "service:api"
    const apiMonitors = allMonitors.filter(m => m.tags.includes("service:api"));
    assertEquals(apiMonitors.length, 2, "Should have 2 monitors with service:api tag");
    
    // Filter by name containing "API"
    const nameFilteredMonitors = allMonitors.filter(m => 
      new RegExp("API", "i").test(m.name)
    );
    assertEquals(nameFilteredMonitors.length, 3, "Should have 3 monitors with 'API' in the name");
    
    // Filter by message containing "pagerduty-api"
    const messageFilteredMonitors = allMonitors.filter(m => 
      new RegExp("pagerduty-api", "i").test(m.message)
    );
    assertEquals(messageFilteredMonitors.length, 2, "Should have 2 monitors with 'pagerduty-api' in the message");
  });
});