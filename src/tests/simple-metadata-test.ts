/**
 * Simple test for additionalMetadata functionality using environment stubbing
 */
import { assertEquals } from "https://deno.land/std@0.171.0/testing/asserts.ts";
import { MigrationService } from "../services/migration.ts";
import { MigrationType } from "../types/index.ts";
import { createPagerDutyMonitor, createTestConfig, createTestMappings } from "./utils/test-utils.ts";
import { createMockDatadogService } from "./utils/mock-services.ts";
import { withMockedEnv } from "./utils/test-stub.ts";

Deno.test("additionalMetadata - simple test", async () => {
  await withMockedEnv(async () => {
    // Create a mock service
    const mockService = createMockDatadogService();

    // Create test monitor with PagerDuty service mention
    const monitor = createPagerDutyMonitor("api-critical", {
      id: 1,
      tags: ["env:prod"],
    });

    console.log("Test monitor created:", JSON.stringify(monitor));

    // Set up the mock
    mockService.monitors = [monitor];

    // Create test config
    const config = createTestConfig({
      webhookPerTeam: false,
      addTeamTags: true,
      source: "pagerduty",
    });

    console.log("Test config:", JSON.stringify(config));

    // Create test mappings
    const mappings = createTestMappings("pagerduty");
    console.log("Test mappings:", JSON.stringify(mappings));

    // Create migration service
    const migrationService = new MigrationService(
      // deno-lint-ignore no-explicit-any
      mockService as any,
      config,
      mappings,
      { dryRun: false },
    );

    // Run migration
    console.log("Running migration...");
    const result = await migrationService.migrateMonitors({
      type: MigrationType.ADD_INCIDENTIO_WEBHOOK,
      webhookPerTeam: false,
    });

    console.log("Migration result:", JSON.stringify(result));
    console.log("Update calls made:", JSON.stringify(mockService.updateCalls));

    // Verify the calls
    assertEquals(
      mockService.updateCalls.length,
      1,
      "Should make one update call",
    );

    // Check that tags were added correctly
    const updateCall = mockService.updateCalls[0];
    assertEquals(updateCall.id, 1, "Should update the correct monitor");

    // Sort the tags for consistent comparison
    const expectedTags = [
      "env:prod",
      "team:api-team",
      "priority:high",
      "service:api",
    ].sort();
    const actualTags = [...(updateCall.data.tags || [])].sort();

    assertEquals(actualTags, expectedTags, "Tags should include metadata");
  });
});
