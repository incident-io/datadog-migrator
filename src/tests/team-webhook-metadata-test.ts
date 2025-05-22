/**
 * Test for additionalMetadata functionality with team-specific webhooks
 * Uses environment stubbing approach
 */
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.171.0/testing/asserts.ts";
import { MigrationService } from "../services/migration.ts";
import { MigrationType } from "../types/index.ts";
import { createPagerDutyMonitor, createTestConfig, createTestMappings } from "./utils/test-utils.ts";
import { createMockDatadogService } from "./utils/mock-services.ts";
import { withMockedEnv } from "./utils/test-stub.ts";

Deno.test("additionalMetadata with team-specific webhooks", async () => {
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

    // Create test config with webhookPerTeam = true
    const config = createTestConfig({
      webhookPerTeam: true,
      addTeamTags: false, // We're testing webhooks, not tags
      source: "pagerduty",
    });

    console.log("Test config:", JSON.stringify(config));

    // Create test mappings
    const mappings = createTestMappings("pagerduty");
    console.log("Test mappings:", JSON.stringify(mappings));

    // Create migration service - cast the mock to any to bypass type checking
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
      webhookPerTeam: true,
    });

    console.log("Migration result:", JSON.stringify(result));
    console.log("Update calls made:", JSON.stringify(mockService.updateCalls));
    console.log(
      "Webhook calls made:",
      JSON.stringify(mockService.webhookCalls),
    );

    // Verify the update calls
    assertEquals(
      mockService.updateCalls.length,
      1,
      "Should make one update call",
    );

    // Verify the webhook calls
    assertEquals(
      mockService.webhookCalls.length,
      1,
      "Should create one webhook",
    );

    // Check that the webhook payload includes the additional metadata
    const webhook = mockService.webhookCalls[0];
    assertEquals(
      webhook.name,
      "incident-io-api-team",
      "Webhook should have team name",
    );

    // Verify the payload contains our metadata
    assertStringIncludes(
      webhook.payload,
      '"priority": "high"',
      "Webhook payload should include priority metadata",
    );
    assertStringIncludes(
      webhook.payload,
      '"service": "api"',
      "Webhook payload should include service metadata",
    );

    // Check that the monitor message was updated with the team-specific webhook
    const updateCall = mockService.updateCalls[0];
    assertEquals(updateCall.id, 1, "Should update the correct monitor");
    assertStringIncludes(
      updateCall.data.message as string,
      "@webhook-incident-io-api-team",
      "Monitor message should include team-specific webhook",
    );
  });
});
