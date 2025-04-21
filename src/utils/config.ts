import fs from "fs";
import path from "path";
import { MigrationConfig } from "@/types";

// Enable or disable debug logging
export const DEBUG = false;

// Global debug logging function
export function debug(message: string, ...args: unknown[]) {
  if (DEBUG) {
    console.log(`[DEBUG] ${message}`, ...args);
  }
}

export function loadConfig(
  filePath: string,
  create: boolean = false,
): MigrationConfig {
  try {
    const configPath = path.resolve(filePath);

    // Check if file exists
    if (!fs.existsSync(configPath)) {
      if (create) {
        // Create a new config file with default values
        const defaultConfig = createDefaultConfig();
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        console.log(`Created new config file at ${configPath}`);
        return defaultConfig;
      } else {
        throw new Error(`Config file not found: ${configPath}`);
      }
    }

    const configContent = fs.readFileSync(configPath, "utf8");
    const config = JSON.parse(configContent) as MigrationConfig;

    if (
      !config.incidentioConfig ||
      !config.incidentioConfig.webhookNameFormat
    ) {
      if (!config.incidentioConfig) {
        config.incidentioConfig = {
          webhookNameFormat: "webhook-incident-io-{team}",
          defaultWebhook: "webhook-incident-io",
        };
      } else if (!config.incidentioConfig.webhookNameFormat) {
        config.incidentioConfig.webhookNameFormat =
          "webhook-incident-io-{team}";
      }

      // Save the updated config back to the file
      if (create) {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log(
          `Updated config file with default incident.io configuration`,
        );
      }
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
      webhookNameFormat: "webhook-incident-io-{team}",
      defaultWebhook: "webhook-incident-io",
    },
    mappings: [],
  };
}
