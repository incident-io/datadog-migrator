import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { PAGERDUTY_SERVICE_REGEX } from "../utils/regex.ts";

Deno.test("PAGERDUTY_SERVICE_REGEX extracts service name correctly", () => {
  // Test regular service name
  const basicCase = "@pagerduty-ServiceName";
  const basicMatches = [...basicCase.matchAll(PAGERDUTY_SERVICE_REGEX)];
  assertEquals(basicMatches.length, 1);
  assertEquals(basicMatches[0][1], "ServiceName");

  // Test with template variables
  const templateCase = "@pagerduty-MyService{{/is_warning_recovery}}";
  const templateMatches = [...templateCase.matchAll(PAGERDUTY_SERVICE_REGEX)];
  assertEquals(templateMatches.length, 1);
  assertEquals(templateMatches[0][1], "MyService");

  // Test another template variable case
  const templateCase2 = "@pagerduty-MyServiceCritical{{/is_alert}}";
  const templateMatches2 = [...templateCase2.matchAll(PAGERDUTY_SERVICE_REGEX)];
  assertEquals(templateMatches2.length, 1);
  assertEquals(templateMatches2[0][1], "MyServiceCritical");

  // Test multiple instances
  const multiCase = "Alert @pagerduty-Service1 and also @pagerduty-Service2{{/is_warning}}";
  const multiMatches = [...multiCase.matchAll(PAGERDUTY_SERVICE_REGEX)];
  assertEquals(multiMatches.length, 2);
  assertEquals(multiMatches[0][1], "Service1");
  assertEquals(multiMatches[1][1], "Service2");
});

Deno.test("PAGERDUTY_SERVICE_REGEX handles special characters in service names", () => {
  // Test with hyphens
  const hyphenCase = "@pagerduty-Service-With-Hyphens";
  const hyphenMatches = [...hyphenCase.matchAll(PAGERDUTY_SERVICE_REGEX)];
  assertEquals(hyphenMatches.length, 1);
  assertEquals(hyphenMatches[0][1], "Service-With-Hyphens");

  // Test with underscores
  const underscoreCase = "@pagerduty-Service_With_Underscores";
  const underscoreMatches = [...underscoreCase.matchAll(PAGERDUTY_SERVICE_REGEX)];
  assertEquals(underscoreMatches.length, 1);
  assertEquals(underscoreMatches[0][1], "Service_With_Underscores");
  
  // Test with numbers
  const numericCase = "@pagerduty-123NumericService";
  const numericMatches = [...numericCase.matchAll(PAGERDUTY_SERVICE_REGEX)];
  assertEquals(numericMatches.length, 1);
  assertEquals(numericMatches[0][1], "123NumericService");
});