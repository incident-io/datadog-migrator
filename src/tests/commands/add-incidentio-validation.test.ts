/**
 * Tests for add-incidentio command validation behavior
 *
 * These tests verify that the command properly validates service mappings
 * before executing the migration. The validation ensures:
 * 1. All provider services must have mappings
 * 2. When using team-specific webhooks, all mappings must have team assignments
 * 3. When using single webhook with addTeamTags, all mappings must have team assignments
 */
import { assertEquals, assertRejects } from "https://deno.land/std@0.171.0/testing/asserts.ts";
import { MigrationService } from "../../services/migration.ts";
import type { DatadogService } from "../../services/datadog.ts";
import { MigrationType } from "../../types/index.ts";
import { MockDatadogService } from "../utils/mock-datadog-service.ts";
import { createOpsgenieMonitor, createPagerDutyMonitor, createTestConfig } from "../utils/test-utils.ts";
import { withMockedEnv } from "../utils/test-stub.ts";

/**
 * Test that add-incidentio command validates PagerDuty service mappings
 * This test verifies:
 * - If a PagerDuty service in a monitor doesn't have a mapping, an error is thrown
 * - The error message contains the unmapped service name
 */
Deno.test("add-incidentio - detects and rejects unmapped PagerDuty services", async () => {
  await withMockedEnv(async () => {
    // Create and configure mock service with an unmapped service
    const mockDatadogService = new MockDatadogService();

    // Set up monitors with various configurations including an unmapped service
    mockDatadogService.monitors = [
      createPagerDutyMonitor("api-critical", { id: 1, tags: ["env:prod"] }),
      createPagerDutyMonitor("database", { id: 2, tags: ["env:prod"] }),
      createPagerDutyMonitor("unmapped-service", { id: 3, tags: ["env:prod"] }), // This service has no mapping
    ];

    // Create test config with only two of the services mapped
    const config = {
      incidentioConfig: createTestConfig({
        webhookPerTeam: false,
        addTeamTags: true,
        source: "pagerduty",
      }),
      // Only map api-critical and database, leave unmapped-service unmapped
      mappings: [
        {
          pagerdutyService: "api-critical",
          incidentioTeam: "api-team",
          additionalMetadata: {
            priority: "high",
            service: "api",
          },
        },
        {
          pagerdutyService: "database",
          incidentioTeam: "platform-team",
          additionalMetadata: {
            priority: "high",
            service: "database",
          },
        },
      ],
    };

    // Create migration service
    const migrationService = new MigrationService(
      mockDatadogService as unknown as DatadogService,
      config.incidentioConfig,
      config.mappings,
      { dryRun: false },
    );

    // Act - attempt to run the migration, expect it to throw
    await assertRejects(
      async () => {
        await migrationService.migrateMonitors({
          type: MigrationType.ADD_INCIDENTIO_WEBHOOK,
          dryRun: false,
        });
      },
      Error,
      "Missing mappings for PagerDuty services: unmapped-service",
      "Should throw an error for unmapped services",
    );
  });
});

/**
 * Test that add-incidentio command validates Opsgenie service mappings
 * This test verifies:
 * - If an Opsgenie service in a monitor doesn't have a mapping, an error is thrown
 * - The error message contains the unmapped service name
 */
Deno.test("add-incidentio - detects and rejects unmapped Opsgenie services", async () => {
  await withMockedEnv(async () => {
    // Create and configure mock service with an unmapped service
    const mockDatadogService = new MockDatadogService();

    // Set up monitors with various configurations including an unmapped service
    mockDatadogService.monitors = [
      createOpsgenieMonitor("api-critical", { id: 1, tags: ["env:prod"] }),
      createOpsgenieMonitor("database", { id: 2, tags: ["env:prod"] }),
      createOpsgenieMonitor("unmapped-service", { id: 3, tags: ["env:prod"] }), // This service has no mapping
    ];

    // Create test config with only two of the services mapped
    const config = {
      incidentioConfig: createTestConfig({
        webhookPerTeam: false,
        addTeamTags: true,
        source: "opsgenie", // Using Opsgenie as the source
      }),
      // Only map api-critical and database, leave unmapped-service unmapped
      mappings: [
        {
          opsgenieService: "api-critical", // Note: opsgenieService instead of pagerdutyService
          incidentioTeam: "api-team",
          additionalMetadata: {
            priority: "high",
            service: "api",
          },
        },
        {
          opsgenieService: "database", // Note: opsgenieService instead of pagerdutyService
          incidentioTeam: "platform-team",
          additionalMetadata: {
            priority: "high",
            service: "database",
          },
        },
      ],
    };

    // Create migration service
    const migrationService = new MigrationService(
      mockDatadogService as unknown as DatadogService,
      config.incidentioConfig,
      config.mappings,
      { dryRun: false },
    );

    // Act - attempt to run the migration, expect it to throw
    await assertRejects(
      async () => {
        await migrationService.migrateMonitors({
          type: MigrationType.ADD_INCIDENTIO_WEBHOOK,
          dryRun: false,
        });
      },
      Error,
      "Missing mappings for Opsgenie services: unmapped-service",
      "Should throw an error for unmapped services",
    );
  });
});

/**
 * Test that add-incidentio command does NOT validate in dry-run mode
 * This test verifies:
 * - If in dry run mode, the command doesn't throw an error for unmapped services
 * - The validation results are included in the migration results
 */
Deno.test("add-incidentio - does not reject unmapped services in dry-run mode", async () => {
  await withMockedEnv(async () => {
    // Create and configure mock service with an unmapped service
    const mockDatadogService = new MockDatadogService();

    // Set up monitors with various configurations including an unmapped service
    mockDatadogService.monitors = [
      createPagerDutyMonitor("api-critical", { id: 1, tags: ["env:prod"] }),
      createPagerDutyMonitor("unmapped-service", { id: 2, tags: ["env:prod"] }), // This service has no mapping
    ];

    // Create test config with only one of the services mapped
    const config = {
      incidentioConfig: createTestConfig({
        webhookPerTeam: false,
        addTeamTags: true,
        source: "pagerduty",
      }),
      // Only map api-critical, leave unmapped-service unmapped
      mappings: [
        {
          pagerdutyService: "api-critical",
          incidentioTeam: "api-team",
          additionalMetadata: {
            priority: "high",
            service: "api",
          },
        },
      ],
    };

    // Create migration service with dryRun: true
    const migrationService = new MigrationService(
      mockDatadogService as unknown as DatadogService,
      config.incidentioConfig,
      config.mappings,
      { dryRun: true },
    );

    // Act - run the migration in dry run mode
    const result = await migrationService.migrateMonitors({
      type: MigrationType.ADD_INCIDENTIO_WEBHOOK,
      dryRun: true,
    });

    // Assert the validation results
    assertEquals(
      result.validationResults?.valid,
      false,
      "Validation should fail",
    );
    assertEquals(
      result.validationResults?.unmappedServices.includes("unmapped-service"),
      true,
      "Should include unmapped-service in validation results",
    );

    // Verify that the monitors were still processed
    assertEquals(
      result.processed,
      2,
      "Should process all monitors in dry run mode",
    );
  });
});

/**
 * Test that add-incidentio command validates team names when using team-specific webhooks
 * This test verifies:
 * - If a team name is null or invalid, an error is thrown when using team-specific webhooks
 * - The error message contains the service with the missing team
 */
Deno.test("add-incidentio - requires valid team names with team-specific webhooks", async () => {
  await withMockedEnv(async () => {
    // Create and configure mock service
    const mockDatadogService = new MockDatadogService();

    // Set up monitors with PagerDuty services
    mockDatadogService.monitors = [
      createPagerDutyMonitor("api-critical", { id: 1, tags: ["env:prod"] }),
      createPagerDutyMonitor("database", { id: 2, tags: ["env:prod"] }),
    ];

    // Create test config with team webhooks and a null team
    const config = {
      incidentioConfig: createTestConfig({
        webhookPerTeam: true, // Using team-specific webhooks
        addTeamTags: false,
        source: "pagerduty",
      }),
      // Map api-critical properly but leave database with null team
      mappings: [
        {
          pagerdutyService: "api-critical",
          incidentioTeam: "api-team",
          additionalMetadata: {
            priority: "high",
            service: "api",
          },
        },
        {
          pagerdutyService: "database",
          incidentioTeam: null, // Null team should cause validation to fail
          additionalMetadata: {
            priority: "high",
            service: "database",
          },
        },
      ],
    };

    // Create migration service
    const migrationService = new MigrationService(
      mockDatadogService as unknown as DatadogService,
      config.incidentioConfig,
      config.mappings,
      { dryRun: false },
    );

    // Act - attempt to run the migration, expect it to throw
    await assertRejects(
      async () => {
        await migrationService.migrateMonitors({
          type: MigrationType.ADD_INCIDENTIO_WEBHOOK,
          webhookPerTeam: true,
          dryRun: false,
        });
      },
      Error,
      "Missing team assignments for: database",
      "Should throw an error for null team assignments when using team webhooks",
    );
  });
});

/**
 * Test that add-incidentio command validates team names when using single webhook with addTeamTags
 * This test verifies:
 * - If a team name is null or invalid, an error is thrown when using single webhook with addTeamTags enabled
 * - The error message contains the service with the missing team
 */
Deno.test("add-incidentio - requires valid team names with single webhook and addTeamTags", async () => {
  await withMockedEnv(async () => {
    // Create and configure mock service
    const mockDatadogService = new MockDatadogService();

    // Set up monitors with PagerDuty services
    mockDatadogService.monitors = [
      createPagerDutyMonitor("api-critical", { id: 1, tags: ["env:prod"] }),
      createPagerDutyMonitor("database", { id: 2, tags: ["env:prod"] }),
    ];

    // Create test config with single webhook but addTeamTags enabled and a null team
    const config = {
      incidentioConfig: createTestConfig({
        webhookPerTeam: false, // Single webhook mode
        addTeamTags: true, // But with team tags enabled
        teamTagPrefix: "team", // Using default team tag prefix
        source: "pagerduty",
      }),
      // Map api-critical properly but leave database with null team
      mappings: [
        {
          pagerdutyService: "api-critical",
          incidentioTeam: "api-team",
          additionalMetadata: {
            priority: "high",
            service: "api",
          },
        },
        {
          pagerdutyService: "database",
          incidentioTeam: null, // Null team should cause validation to fail
          additionalMetadata: {
            priority: "high",
            service: "database",
          },
        },
      ],
    };

    // Create migration service
    const migrationService = new MigrationService(
      mockDatadogService as unknown as DatadogService,
      config.incidentioConfig,
      config.mappings,
      { dryRun: false },
    );

    // Act - attempt to run the migration, expect it to throw
    await assertRejects(
      async () => {
        await migrationService.migrateMonitors({
          type: MigrationType.ADD_INCIDENTIO_WEBHOOK,
          webhookPerTeam: false, // Single webhook mode
          dryRun: false,
        });
      },
      Error,
      "Missing team assignments for: database",
      "Should throw an error for null team assignments when using single webhook with addTeamTags",
    );
  });
});
