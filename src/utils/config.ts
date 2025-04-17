import fs from 'fs';
import path from 'path';
import { MigrationConfig, MigrationMapping } from '../types';

export function loadConfig(filePath: string): MigrationConfig {
  try {
    const configPath = path.resolve(filePath);
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent) as MigrationConfig;

    // Validate config
    if (!config.datadogConfig || !config.datadogConfig.apiKey || !config.datadogConfig.appKey) {
      throw new Error('Missing Datadog API or App key in config file');
    }

    if (!config.incidentioConfig || !config.incidentioConfig.webhookNameFormat) {
      throw new Error('Missing incident.io configuration in config file');
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
    datadogConfig: {
      apiKey: '',
      appKey: '',
      baseUrl: 'https://api.datadoghq.com/api/v1'
    },
    incidentioConfig: {
      webhookNameFormat: 'webhook-incident-io-{team}',
      defaultWebhook: 'webhook-incident-io'
    },
    mappings: []
  };
}

export function saveMappings(mappings: MigrationMapping[], filePath: string): void {
  try {
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    fs.writeFileSync(filePath, JSON.stringify(mappings, null, 2));
  } catch (error) {
    throw new Error(`Failed to save mappings: ${error instanceof Error ? error.message : String(error)}`);
  }
}