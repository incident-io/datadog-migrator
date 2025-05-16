/**
 * Shared utilities for filtering Datadog monitors
 */

import { DatadogMonitor } from "../types/index.ts";
import { FilterOptions } from "../types/prepareFilterOptions.ts";

/**
 * Filter monitors based on the provided filter options
 * @param monitors Array of Datadog monitors to filter
 * @param options Filter options (tags, name, message)
 * @returns Filtered array of monitors
 */
export function filterMonitors(
  monitors: DatadogMonitor[],
  options: FilterOptions
): DatadogMonitor[] {
  let filtered = [...monitors];

  // Filter by tags
  if (options.tags && options.tags.length > 0) {
    filtered = filtered.filter((monitor) =>
      options.tags!.some((tag) => monitor.tags.includes(tag))
    );
  }

  // Filter by name
  if (options.name) {
    const namePattern = new RegExp(options.name, "i");
    filtered = filtered.filter((monitor) => namePattern.test(monitor.name));
  }

  // Filter by message content
  if (options.message) {
    const messagePattern = new RegExp(options.message, "i");
    filtered = filtered.filter((monitor) =>
      messagePattern.test(monitor.message)
    );
  }

  return filtered;
}