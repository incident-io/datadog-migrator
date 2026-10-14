import { expect, test } from "bun:test";
import { MigrationService } from "../../services/migration.ts";
import type { DatadogService } from "../../services/datadog.ts";
import { MigrationType } from "../../types/index.ts";
import { MockDatadogService } from "../utils/mock-datadog-service.ts";
import { createTestConfig, createTestMonitor } from "../utils/test-utils.ts";

const message = [
  "{{#is_alert}}",
  "CPU is high on {{host.name}}",
  "{{/is_alert}}",
  "",
  "@pagerduty-api-critical @webhook-incident-io-old",
].join("\n");

async function migrate(type: MigrationType): Promise<string> {
  const datadog = new MockDatadogService();
  datadog.monitors = [createTestMonitor({ message })];
  const migration = new MigrationService(
    datadog as unknown as DatadogService,
    createTestConfig(),
    [{ pagerdutyService: "api-critical", incidentioTeam: "api-team" }],
    { dryRun: true },
  );
  const result = await migration.migrateMonitors({ type, dryRun: true });
  return result.changes[0].after;
}

test("add-incidentio keeps line breaks when it replaces a webhook", async () => {
  expect(await migrate(MigrationType.ADD_INCIDENTIO_WEBHOOK)).toBe(
    message.replace("@webhook-incident-io-old", "@webhook-incident-io"),
  );
});

test("remove-incidentio keeps line breaks", async () => {
  expect(await migrate(MigrationType.REMOVE_INCIDENTIO_WEBHOOK)).toBe(
    message.replace(" @webhook-incident-io-old", ""),
  );
});

test("remove-provider keeps line breaks", async () => {
  expect(await migrate(MigrationType.REMOVE_PROVIDER)).toBe(
    message.replace("@pagerduty-api-critical ", ""),
  );
});
