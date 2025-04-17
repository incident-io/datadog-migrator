export interface DatadogConfig {
  apiKey: string;
  appKey: string;
  baseUrl?: string;
}

export interface IncidentioConfig {
  webhookNameFormat: string;
  defaultWebhook?: string;
}

export interface MigrationMapping {
  pagerdutyService?: string;
  incidentioTeam?: string;
  webhookName?: string;
}

export interface MigrationConfig {
  mappings: MigrationMapping[];
  datadogConfig: DatadogConfig;
  incidentioConfig: IncidentioConfig;
}

export interface DatadogMonitor {
  id: number;
  name: string;
  message: string;
  tags: string[];
  // Additional properties as needed
}

export enum MigrationType {
  ADD_INCIDENTIO_WEBHOOK = 'add_incidentio',
  REMOVE_INCIDENTIO_WEBHOOK = 'remove_incidentio',
  REMOVE_PAGERDUTY = 'remove_pagerduty',
}

export interface MigrationOptions {
  dryRun?: boolean;
  migrationMappingFile?: string;
  type: MigrationType;
  singleWebhook?: boolean;
}