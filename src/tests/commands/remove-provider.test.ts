import { expect, test } from "bun:test";
import { MigrationService } from "../../services/migration.ts";
import type { DatadogService } from "../../services/datadog.ts";
import { MigrationType } from "../../types/index.ts";
import { MockDatadogService } from "../utils/mock-datadog-service.ts";
import {
  createMixedMonitor,
  createPagerDutyMonitor,
  createTestConfig,
} from "../utils/test-utils.ts";

test("remove-provider only removes PagerDuty where incident.io is already added", async () => {
  const datadog = new MockDatadogService();
  datadog.monitors = [
    createPagerDutyMonitor("api-critical", { id: 1 }),
    createMixedMonitor("pagerduty", "database", undefined, { id: 2 }),
  ];
  const migration = new MigrationService(
    datadog as unknown as DatadogService,
    createTestConfig(),
  );

  const result = await migration.migrateMonitors({
    type: MigrationType.REMOVE_PROVIDER,
    dryRun: false,
    verbose: true,
  });

  expect(datadog.updateCalls.map((call) => call.id)).toEqual([2]);
  expect(datadog.updateCalls[0].data.message).not.toContain("@pagerduty-");
  expect(result.unchanged).toBe(1);
  expect(result.changes.find((change) => change.id === 1)?.reason).toContain(
    "No incident.io webhook",
  );
});
