import { FilterOptions } from "./index.ts";

/**
 * Prepare filter options from command arguments
 */
export function prepareFilterOptions(options: {
  tags?: string;
  name?: string;
  message?: string;
}): FilterOptions | undefined {
  if (!options.tags && !options.name && !options.message) {
    return undefined;
  }

  const filterOptions: FilterOptions = {};

  // Convert comma-separated tags to array
  if (options.tags) {
    filterOptions.tags = options.tags.split(",").map((t: string) => t.trim());
  }

  // Pass name and message directly
  if (options.name) {
    filterOptions.name = options.name;
  }

  if (options.message) {
    filterOptions.message = options.message;
  }

  return filterOptions;
}