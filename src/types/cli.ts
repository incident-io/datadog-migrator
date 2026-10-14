/**
 * Shared interfaces and utilities for CLI commands
 */

/**
 * Base options interface that all commands share
 */
export interface BaseCommandOptions {
  // API Authentication options
  apiKey: string;
  appKey: string;

  // Config path
  config: string;
}

/**
 * Options for commands that support filtering
 */
export interface FilterableCommandOptions extends BaseCommandOptions {
  // Filter options
  tags?: string;
  name?: string;
  message?: string;
}

/**
 * Options for migration commands that modify monitors
 */
export interface MigrationCommandOptions extends FilterableCommandOptions {
  // Execution mode options
  dryRun?: boolean;
  verbose: boolean;
}

/**
 * Options for analyze command
 */
export interface AnalyzeCommandOptions extends FilterableCommandOptions {
  showMonitors?: boolean;
  verbose?: boolean; // Added for compatibility with withErrorHandling
}

/**
 * Command option definitions for consistent option setup
 */
export const CommandOptions = {
  // Authentication options
  apiKey: {
    flag: "-k, --api-key <key>",
    description: "Datadog API key",
    defaultEnv: "DATADOG_API_KEY",
  },
  appKey: {
    flag: "-a, --app-key <key>",
    description: "Datadog App key",
    defaultEnv: "DATADOG_APP_KEY",
  },
  
  // Config option
  config: {
    flag: "-c, --config <path>",
    description: "Path to config file",
    required: true,
  },
  
  // Filter options
  tags: {
    flag: "-t, --tags <tags>",
    description: "Filter monitors by tags (comma-separated)",
  },
  name: {
    flag: "-n, --name <pattern>",
    description: "Filter monitors by name pattern",
  },
  message: {
    flag: "--message <pattern>",
    description: "Filter monitors by message pattern",
  },
  
  // Execution mode options
  dryRun: {
    flag: "-d, --dry-run",
    description: "Dry run mode (no actual changes)",
  },
  verbose: {
    flag: "-v, --verbose",
    description: "Show detailed output including unchanged monitors",
    defaultValue: true,
  },
  
  // Analyze-specific options
  showMonitors: {
    flag: "--show-monitors",
    description: "Show detailed list of monitors",
  },
  
  // Init-specific options
  path: {
    flag: "-p, --path <path>",
    description: "Path to save config file",
  },
};