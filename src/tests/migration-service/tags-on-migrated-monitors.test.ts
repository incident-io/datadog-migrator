import { expect, test } from "bun:test";
import { MigrationService } from "../../services/migration.ts";
import type { DatadogService } from "../../services/datadog.ts";
import { MigrationType } from "../../types/index.ts";
import { MockDatadogService } from "../utils/mock-datadog-service.ts";
import {
  createMixedMonitor,
  createTestConfig,
  createTestMappings,
} from "../utils/test-utils.ts";

test("add-incidentio adds team tags to monitors that already have the webhook", async () => {
  const datadog = new MockDatadogService();
  const monitor = createMixedMonitor("pagerduty", "api-critical", undefined, {
    tags: ["env:prod"],
  });
  datadog.monitors = [monitor];
  const migration = new MigrationService(
    datadog as unknown as DatadogService,
    createTestConfig({ addTeamTags: true }),
    createTestMappings(),
  );

  const result = await migration.migrateMonitors({
    type: MigrationType.ADD_INCIDENTIO_WEBHOOK,
    dryRun: false,
  });

  expect(result.updated).toBe(1);
  expect(datadog.updateCalls[0].data.message).toBe(monitor.message);
  expect(datadog.updateCalls[0].data.tags).toContain("team:api-team");
});
