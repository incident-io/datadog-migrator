import { afterEach, expect, test } from "bun:test";
import { DatadogService } from "../services/datadog.ts";

function monitorsUrl(): string {
  const service = new DatadogService({ apiKey: "a", appKey: "b" });
  // @ts-expect-error reaching into the client to read the resolved server
  const configuration = service.monitorsApi.configuration;
  return configuration
    .getServer("v1.MonitorsApi.listMonitors")
    .makeRequestContext("/api/v1/monitor", "GET")
    .getUrl();
}

afterEach(() => {
  delete process.env.DATADOG_SITE;
  delete process.env.DD_SITE;
});

// The client applies DD_SITE to shared server objects, so the DD_SITE cases run last
test("defaults to datadoghq.com", () => {
  expect(monitorsUrl()).toStartWith("https://api.datadoghq.com/");
});

test("uses DATADOG_SITE", () => {
  process.env.DATADOG_SITE = "datadoghq.eu";
  expect(monitorsUrl()).toStartWith("https://api.datadoghq.eu/");
});

test("uses DD_SITE", () => {
  process.env.DD_SITE = "us3.datadoghq.com";
  expect(monitorsUrl()).toStartWith("https://api.us3.datadoghq.com/");
});

test("prefers DATADOG_SITE over DD_SITE", () => {
  process.env.DD_SITE = "us3.datadoghq.com";
  process.env.DATADOG_SITE = "datadoghq.eu";
  expect(monitorsUrl()).toStartWith("https://api.datadoghq.eu/");
});
