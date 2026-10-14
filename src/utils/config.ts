import * as fs from "node:fs";
import * as path from "node:path";
import { MigrationConfig } from "../types/index.ts";

// Global debug logging function
export function debug(message: string, ...args: unknown[]) {
  if (process.env.DEBUG) {
    console.log(`[DEBUG] ${message}`, ...args);
  }
}

export function loadConfig(filePath: string): MigrationConfig {
  try {
    const configPath = path.resolve(filePath);

    // Check if file exists
    try {
      const fileInfo = fs.statSync(configPath);
      if (!fileInfo.isFile()) {
        throw new Error(`Path exists but is not a file: ${configPath}`);
      }
    } catch (err) {
      // File doesn't exist
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`Config file not found: ${configPath}`);
      }
      throw err;
    }

    const configContent = fs.readFileSync(configPath, "utf8");
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
    const envWebhookToken = process.env.INCIDENTIO_WEBHOOK_TOKEN;
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
