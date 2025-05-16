/**
 * Shared interfaces and utilities for CLI commands
 */

/**
 * Base options interface that all commands share
 */
export interface BaseCommandOptions {
  // API Authentication options
  "api-key": string;
  "app-key": string;

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
  "dry-run"?: boolean;
  verbose: boolean;
}

/**
 * Options for analyze command
 */
export interface AnalyzeCommandOptions extends FilterableCommandOptions {
  "show-monitors"?: boolean;
  verbose?: boolean; // Added for compatibility with withErrorHandling
}

/**
 * Options for init command
 */
export interface InitCommandOptions extends BaseCommandOptions {
  path?: string;
}

/**
 * Standard parameter transformer for Denomander
 * Returns the provided value unchanged
 */
export const identity = (i: string) => i;

/**
 * Command option definitions for consistent option setup
 */
export const CommandOptions = {
  // Authentication options
  apiKey: {
    flag: "-k, --api-key",
    description: "Datadog API key",
    defaultEnv: "DATADOG_API_KEY",
  },
  appKey: {
    flag: "-a, --app-key",
    description: "Datadog App key",
    defaultEnv: "DATADOG_APP_KEY",
  },
  
  // Config option
  config: {
    flag: "-c, --config",
    description: "Path to config file",
    required: true,
  },
  
  // Filter options
  tags: {
    flag: "-t, --tags",
    description: "Filter monitors by tags (comma-separated)",
  },
  name: {
    flag: "-n, --name",
    description: "Filter monitors by name pattern",
  },
  message: {
    flag: "--message",
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
    flag: "-p, --path",
    description: "Path to save config file",
  },
};