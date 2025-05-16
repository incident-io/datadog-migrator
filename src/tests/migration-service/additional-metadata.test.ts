/**
 * Tests for the additionalMetadata functionality in MigrationService
 */
import { 
  createPagerDutyMonitor,
  createOpsgenieMonitor,
  createTestConfig,
  createTestMappings
} from "../utils/test-utils.ts";
import { MockDatadogService, testAdditionalMetadata } from "./test-migration.ts";

Deno.test("additionalMetadata - single webhook mode adds metadata as tags", async () => {
  // ARRANGE
  const mockDatadogService = new MockDatadogService();
  
  // Set up config with single webhook and addTeamTags enabled
  const config = createTestConfig({
    webhookPerTeam: false,
    addTeamTags: true,
    source: "pagerduty"
  });
  
  // Create mappings with additionalMetadata
  const mappings = createTestMappings("pagerduty");
  
  // Create a monitor that references one of our services
  const monitor = createPagerDutyMonitor("api-critical", {
    id: 1,
    tags: ["env:prod"]
  });
  
  mockDatadogService.setMonitors([monitor]);
  
  // ACT & ASSERT
  await testAdditionalMetadata(
    mockDatadogService,
    config,
    mappings,
    monitor,
    // Expected tags (original + team tag + additionalMetadata tags)
    ["env:prod", "team:api-team", "priority:high", "service:api"],
    // No specific webhook name to check (using default webhook)
    null,
    // No webhook payload assertions needed for single webhook mode
    null
  );
});

Deno.test("additionalMetadata - team webhook mode passes metadata to webhook payload", async () => {
  // ARRANGE
  const mockDatadogService = new MockDatadogService();
  
  // Set up config with team-specific webhooks
  const config = createTestConfig({
    webhookPerTeam: true,
    addTeamTags: false, // Tags shouldn't be added in team webhook mode
    source: "pagerduty"
  });
  
  // Create mappings with additionalMetadata
  const mappings = createTestMappings("pagerduty");
  
  // Create a monitor that references one of our services
  const monitor = createPagerDutyMonitor("api-critical", {
    id: 1,
    tags: ["env:prod"]
  });
  
  mockDatadogService.setMonitors([monitor]);
  
  // ACT & ASSERT
  await testAdditionalMetadata(
    mockDatadogService,
    config,
    mappings,
    monitor,
    // No tags expected in team webhook mode
    undefined,
    // Expected webhook name
    "incident-io-api-team",
    // Expected webhook payload contents
    ['"priority": "high"', '"service": "api"', '"team": "api-team"']
  );
});

Deno.test("additionalMetadata - works with Opsgenie services too", async () => {
  // ARRANGE
  const mockDatadogService = new MockDatadogService();
  
  // Set up config with single webhook and addTeamTags enabled, but for Opsgenie
  const config = createTestConfig({
    webhookPerTeam: false,
    addTeamTags: true,
    source: "opsgenie"
  });
  
  // Create mappings with additionalMetadata for Opsgenie
  const mappings = createTestMappings("opsgenie");
  
  // Create a monitor that references one of our Opsgenie services
  const monitor = createOpsgenieMonitor("api-critical", {
    id: 1,
    tags: ["env:prod"]
  });
  
  mockDatadogService.setMonitors([monitor]);
  
  // ACT & ASSERT
  await testAdditionalMetadata(
    mockDatadogService,
    config,
    mappings,
    monitor,
    // Expected tags (original + team tag + additionalMetadata tags)
    ["env:prod", "team:api-team", "priority:high", "service:api"],
    // No specific webhook name to check (using default webhook)
    null,
    // No webhook payload assertions needed for single webhook mode
    null
  );
});