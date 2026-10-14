import { expect, test } from "bun:test";
import { MigrationService } from "../../services/migration.ts";
import type { DatadogService } from "../../services/datadog.ts";
import { MigrationType } from "../../types/index.ts";
import { MockDatadogService } from "../utils/mock-datadog-service.ts";
import {
  createPagerDutyMonitor,
  createTestConfig,
  createTestMappings,
} from "../utils/test-utils.ts";

function setup(datadog: MockDatadogService, webhookToken = "test-token") {
  datadog.monitors = [createPagerDutyMonitor("api-critical", { id: 1 })];
  return new MigrationService(
    datadog as unknown as DatadogService,
    createTestConfig({ webhookToken }),
    createTestMappings(),
  );
}

test("a failed monitor update is reported as an error", async () => {
  const datadog = new MockDatadogService();
  datadog.updateMonitor = () => Promise.reject(new Error("HTTP-Code: 403"));

  const result = await setup(datadog).migrateMonitors({
    type: MigrationType.ADD_INCIDENTIO_WEBHOOK,
    dryRun: false,
  });

  expect(result.unchanged).toBe(0);
  expect(result.errors).toEqual([{ id: 1, error: "HTTP-Code: 403" }]);
});

test("a webhook that cannot be created is reported as an error", async () => {
  const datadog = new MockDatadogService();
  datadog.createWebhook = () => Promise.reject(new Error("HTTP-Code: 403"));

  const result = await setup(datadog).migrateMonitors({
    type: MigrationType.ADD_INCIDENTIO_WEBHOOK,
    dryRun: false,
  });

  expect(result.unchanged).toBe(0);
  expect(result.errors).toEqual([{ id: 1, error: "HTTP-Code: 403" }]);
});

test("a missing webhook token is reported as an error", async () => {
  const result = await setup(new MockDatadogService(), "").migrateMonitors({
    type: MigrationType.ADD_INCIDENTIO_WEBHOOK,
    dryRun: false,
  });

  expect(result.errors[0].error).toContain(
    "Missing incident.io webhook URL or token",
  );
});
