import { expect, test } from "bun:test";
import { MigrationService } from "../../services/migration.ts";
import type { DatadogService } from "../../services/datadog.ts";
import { MigrationType } from "../../types/index.ts";
import { MockDatadogService } from "../utils/mock-datadog-service.ts";
import {
  createOpsgenieMonitor,
  createTestConfig,
  createTestMappings,
} from "../utils/test-utils.ts";

test("team-specific webhooks use the Opsgenie mapping", async () => {
  const datadog = new MockDatadogService();
  datadog.monitors = [createOpsgenieMonitor("api-critical")];
  const migration = new MigrationService(
    datadog as unknown as DatadogService,
    createTestConfig({ source: "opsgenie", webhookPerTeam: true }),
    createTestMappings("opsgenie"),
  );

  await migration.migrateMonitors({
    type: MigrationType.ADD_INCIDENTIO_WEBHOOK,
    webhookPerTeam: true,
    dryRun: false,
  });

  expect(datadog.updateCalls[0].data.message).toContain(
    "@webhook-incident-io-api-team",
  );
  expect(datadog.webhookCalls[0].name).toBe("incident-io-api-team");
  expect(datadog.webhookCalls[0].payload).toContain('"priority": "high"');
});
