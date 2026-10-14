import { expect, test } from "bun:test";
import { MigrationService } from "../../services/migration.ts";
import type { DatadogService } from "../../services/datadog.ts";
import { MigrationType } from "../../types/index.ts";
import { MockDatadogService } from "../utils/mock-datadog-service.ts";
import {
  createPagerDutyMonitor,
  createTestConfig,
} from "../utils/test-utils.ts";

test("webhook payload escapes additionalMetadata values", async () => {
  const datadog = new MockDatadogService();
  datadog.monitors = [createPagerDutyMonitor("api-critical")];
  const migration = new MigrationService(
    datadog as unknown as DatadogService,
    createTestConfig({ webhookPerTeam: true }),
    [
      {
        pagerdutyService: "api-critical",
        incidentioTeam: "api-team",
        additionalMetadata: { runbook: 'see "API down" doc' },
      },
    ],
  );

  await migration.migrateMonitors({
    type: MigrationType.ADD_INCIDENTIO_WEBHOOK,
    webhookPerTeam: true,
    dryRun: false,
  });

  // Datadog fills the $VARIABLES in at send time; stand in values so the rest parses
  const payload = datadog.webhookCalls[0].payload.replace(
    "$LOGS_SAMPLE",
    "null",
  );
  expect(JSON.parse(payload).metadata.runbook).toBe('see "API down" doc');
});
