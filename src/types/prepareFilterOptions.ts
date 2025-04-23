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

  if (options.tags) {
    filterOptions.tags = options.tags.split(",").map((t: string) => t.trim());
  }

  if (options.name) {
    filterOptions.namePattern = new RegExp(options.name, "i");
  }

  if (options.message) {
    filterOptions.messagePattern = new RegExp(options.message, "i");
  }

  return filterOptions;
}
