import * as path from "https://deno.land/std/path/mod.ts";
import { MigrationConfig } from "../types/index.ts";

// Global debug logging function
export function debug(message: string, ...args: unknown[]) {
  if (Deno.env.get("DEBUG")) {
    console.log(`[DEBUG] ${message}`, ...args);
  }
}

export function loadConfig(filePath: string): MigrationConfig {
  try {
    const configPath = path.resolve(filePath);

    // Check if file exists
    try {
      const fileInfo = Deno.statSync(configPath);
      if (!fileInfo.isFile) {
        throw new Error(`Path exists but is not a file: ${configPath}`);
      }
    } catch (err) {
      // File doesn't exist
      if (err instanceof Deno.errors.NotFound) {
        throw new Error(`Config file not found: ${configPath}`);
      }
      throw err;
    }

    const configContent = Deno.readTextFileSync(configPath);
    const config = JSON.parse(configContent) as MigrationConfig;

    // Ensure we have default values for required fields
    if (!config.incidentioConfig) {
      config.incidentioConfig = {
        webhookPerTeam: false,
        webhookUrl: undefined,
        webhookToken: undefined,
        source: "pagerduty" // Default to PagerDuty if not specified
      };
    }

    // Check for webhook token in environment and use it if provided
    const envWebhookToken = Deno.env.get("INCIDENTIO_WEBHOOK_TOKEN");
    if (envWebhookToken) {
      config.incidentioConfig.webhookToken = envWebhookToken;
    }

    if (!config.mappings) {
      config.mappings = [];
    }

    return config;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load config: ${error.message}`);
    }
    throw error;
  }
}

export function createDefaultConfig(): MigrationConfig {
  return {
    incidentioConfig: {
      webhookPerTeam: false,
      webhookUrl: undefined,
      webhookToken: undefined,
      addTeamTags: false,
      teamTagPrefix: "team",
      source: "pagerduty", // Default to PagerDuty
    },
    mappings: [],
  };
}
