/**
 * Tests for remove-incidentio command
 */
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.171.0/testing/asserts.ts";
import { MigrationService } from "../../services/migration.ts";
import type { DatadogService } from "../../services/datadog.ts";
import { MigrationType } from "../../types/index.ts";
import { MockDatadogService } from "../utils/mock-services.ts";
import { createPagerDutyMonitor, createIncidentioMonitor, createMixedMonitor, createTestConfig, createTestMappings, createTestMonitor } from "../utils/test-utils.ts";
import { withMockedEnv } from "../utils/test-stub.ts";

/**
 * Test the remove-incidentio command with single webhook mode
 * This test verifies:
 * - Remove operations recognize and remove the standard incident.io webhook
 * - PagerDuty service mentions are preserved
 * - Only monitors with incident.io webhooks are processed
 */
Deno.test("remove-incidentio command - single webhook mode", async () => {
  await withMockedEnv(async () => {
    // Create and configure mock service
    const mockDatadogService = new MockDatadogService();
    
    // Set up monitors directly
    mockDatadogService.monitors = [
      // PagerDuty only monitor (should be unchanged)
      createPagerDutyMonitor("api-critical", { id: 1, tags: ["env:prod", "team:api-team"] }),
      
      // incident.io only monitor (should be processed)
      createIncidentioMonitor(undefined, { 
        id: 2, 
        tags: ["env:prod", "team:api-team", "priority:high", "service:api"] 
      }),
      
      // Both PagerDuty and incident.io (should have incident.io removed)
      createMixedMonitor("pagerduty", "database", undefined, { 
        id: 3, 
        tags: ["env:prod", "team:platform-team", "priority:high", "service:database"] 
      }),
      
      // Regular monitor (should be unchanged)
      createTestMonitor({ 
        id: 4, 
        name: "Regular Monitor", 
        message: "Just a regular alert with no integrations", 
        tags: ["env:dev"] 
      })
    ];
    
    // Create test config
    const config = {
      incidentioConfig: createTestConfig({
        webhookPerTeam: false,
        source: "pagerduty"
      }),
      mappings: createTestMappings("pagerduty")
    };
    
    // Create migration service
    const migrationService = new MigrationService(
      mockDatadogService as unknown as DatadogService,
      config.incidentioConfig,
      config.mappings,
      { dryRun: false }
    );
    
    // Act - run the migration
    const result = await migrationService.migrateMonitors({
      type: MigrationType.REMOVE_INCIDENTIO_WEBHOOK,
      dryRun: false
    });
    
    // Assert
    console.log("Migration result:", JSON.stringify(result));
    
    // Check that all monitors were processed, but only some were updated
    assertEquals(result.processed, 4, "Should process all monitors");
    assertEquals(result.updated, 2, "Should update 2 monitors");
    
    // Verify that updateMonitor was called twice
    assertEquals(
      mockDatadogService.updateCalls.length, 
      2, 
      "Should call updateMonitor twice"
    );
    
    // Verify that the incident.io only monitor was updated correctly
    const incidentioMonitorUpdate = mockDatadogService.updateCalls
      .find(update => update.id === 2);
    
    if (!incidentioMonitorUpdate) {
      throw new Error("Could not find update for incident.io only monitor");
    }
    
    // The webhook tag should be removed from the message
    const incidentioMessage = incidentioMonitorUpdate.data.message || "";
    assertEquals(
      incidentioMessage.includes("@webhook-incident-io"), 
      false, 
      "incident.io webhook should be removed from message"
    );
    
    // Verify that the mixed monitor was updated correctly
    const mixedMonitorUpdate = mockDatadogService.updateCalls
      .find(update => update.id === 3);
    
    if (!mixedMonitorUpdate) {
      throw new Error("Could not find update for mixed monitor");
    }
    
    const mixedMessage = mixedMonitorUpdate.data.message || "";
    assertEquals(
      mixedMessage.includes("@webhook-incident-io"), 
      false, 
      "incident.io webhook should be removed from message"
    );
    assertEquals(
      mixedMessage.includes("@pagerduty-database"), 
      true, 
      "PagerDuty service should be preserved in message"
    );
    
    // Verify that the PagerDuty only monitor was not updated
    const pdOnlyMonitorUpdate = mockDatadogService.updateCalls
      .find(update => update.id === 1);
    
    assertEquals(
      pdOnlyMonitorUpdate, 
      undefined, 
      "PagerDuty only monitor should not be updated"
    );
    
    // Verify that the regular monitor was not updated
    const regularMonitorUpdate = mockDatadogService.updateCalls
      .find(update => update.id === 4);
    
    assertEquals(
      regularMonitorUpdate, 
      undefined, 
      "Regular monitor should not be updated"
    );
  });
});

/**
 * Test the remove-incidentio command with team webhook mode
 * This test verifies:
 * - Remove operations recognize and remove team-specific incident.io webhooks
 * - PagerDuty service mentions are preserved
 * - Only monitors with incident.io webhooks are processed
 * - Different team webhooks are all properly removed
 */
Deno.test("remove-incidentio command - team webhook mode", async () => {
  await withMockedEnv(async () => {
    // Create and configure mock service
    const mockDatadogService = new MockDatadogService();
    
    // Set up monitors directly
    mockDatadogService.monitors = [
      // incident.io monitors with different team webhooks
      createIncidentioMonitor("api-team", { 
        id: 1, 
        tags: ["env:prod", "team:api-team"] 
      }),
      createIncidentioMonitor("platform-team", { 
        id: 2, 
        tags: ["env:prod", "team:platform-team"] 
      }),
      
      // Mixed monitors with different team webhooks
      createMixedMonitor("pagerduty", "api-critical", "api-team", { 
        id: 3, 
        tags: ["env:prod", "team:api-team"] 
      }),
      createMixedMonitor("pagerduty", "database", "platform-team", { 
        id: 4, 
        tags: ["env:prod", "team:platform-team"] 
      }),
      
      // PagerDuty only monitor (should be unchanged)
      createPagerDutyMonitor("api-non-critical", { 
        id: 5, 
        tags: ["env:staging", "team:api-team"] 
      })
    ];
    
    // Create test config with team-specific webhooks
    const config = {
      incidentioConfig: createTestConfig({
        webhookPerTeam: true,
        source: "pagerduty"
      }),
      mappings: createTestMappings("pagerduty")
    };
    
    // Create migration service
    const migrationService = new MigrationService(
      mockDatadogService as unknown as DatadogService,
      config.incidentioConfig,
      config.mappings,
      { dryRun: false }
    );
    
    // Act - run the migration
    const result = await migrationService.migrateMonitors({
      type: MigrationType.REMOVE_INCIDENTIO_WEBHOOK,
      dryRun: false
    });
    
    // Assert
    console.log("Migration result:", JSON.stringify(result));
    
    // Check that all monitors were processed, but only those with incident.io webhooks were updated
    assertEquals(result.processed, 5, "Should process all monitors");
    assertEquals(result.updated, 4, "Should update 4 monitors");
    
    // Verify that updateMonitor was called 4 times
    assertEquals(
      mockDatadogService.updateCalls.length, 
      4, 
      "Should call updateMonitor 4 times"
    );
    
    // Verify that all incident.io webhooks were removed
    for (const update of mockDatadogService.updateCalls) {
      const message = update.data.message || "";
      assertEquals(
        message.includes("@webhook-incident-io"), 
        false, 
        `incident.io webhook should be removed from monitor ${update.id}`
      );
    }
    
    // Verify that PagerDuty mentions are preserved in mixed monitors
    const apiCriticalUpdate = mockDatadogService.updateCalls
      .find(update => update.id === 3);
    
    if (!apiCriticalUpdate) {
      throw new Error("Could not find update for api-critical mixed monitor");
    }
    
    assertStringIncludes(
      apiCriticalUpdate.data.message || "",
      "@pagerduty-api-critical",
      "PagerDuty service should be preserved in message"
    );
    
    const databaseUpdate = mockDatadogService.updateCalls
      .find(update => update.id === 4);
    
    if (!databaseUpdate) {
      throw new Error("Could not find update for database mixed monitor");
    }
    
    assertStringIncludes(
      databaseUpdate.data.message || "",
      "@pagerduty-database",
      "PagerDuty service should be preserved in message"
    );
    
    // Verify that the PagerDuty only monitor was not updated
    const pdOnlyMonitorUpdate = mockDatadogService.updateCalls
      .find(update => update.id === 5);
    
    assertEquals(
      pdOnlyMonitorUpdate, 
      undefined, 
      "PagerDuty only monitor should not be updated"
    );
  });
});

/**
 * Test the remove-incidentio command with dry run mode
 * This test verifies:
 * - Dry run mode correctly identifies monitors that would be updated
 * - No actual updates are made to the monitors
 */
Deno.test("remove-incidentio command - dry run mode", async () => {
  await withMockedEnv(async () => {
    // Create and configure mock service
    const mockDatadogService = new MockDatadogService();
    
    // Set up monitors directly
    mockDatadogService.monitors = [
      // incident.io only monitor
      createIncidentioMonitor(undefined, { id: 1, tags: ["env:prod"] }),
      
      // Mixed monitor
      createMixedMonitor("pagerduty", "api-critical", undefined, { id: 2, tags: ["env:prod"] }),
      
      // PagerDuty only monitor
      createPagerDutyMonitor("database", { id: 3, tags: ["env:prod"] })
    ];
    
    // Create test config
    const config = {
      incidentioConfig: createTestConfig({
        source: "pagerduty"
      }),
      mappings: createTestMappings("pagerduty")
    };
    
    // Create migration service with dry run mode
    const migrationService = new MigrationService(
      mockDatadogService as unknown as DatadogService,
      config.incidentioConfig,
      config.mappings,
      { dryRun: true }
    );
    
    // Act - run the migration in dry run mode
    const result = await migrationService.migrateMonitors({
      type: MigrationType.REMOVE_INCIDENTIO_WEBHOOK,
      dryRun: true
    });
    
    // Assert
    console.log("Migration result:", JSON.stringify(result));
    
    // Check that monitors were processed
    assertEquals(result.processed, 3, "Should process all monitors");
    
    // In dry run mode, we count affected monitors but don't call the API
    assertEquals(
      mockDatadogService.updateCalls.length, 
      0, 
      "Should not call updateMonitor API in dry run mode"
    );
  });
});