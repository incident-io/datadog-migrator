export interface IncidentioConfig {
  webhookPerTeam: boolean;
  webhookUrl?: string;
  webhookToken?: string;
}

export interface MigrationMapping {
  pagerdutyService?: string;
  incidentioTeam?: string | null;
  webhookName?: string;
}

export interface MigrationConfig {
  mappings: MigrationMapping[];
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
  ADD_INCIDENTIO_WEBHOOK = "add_incidentio",
  REMOVE_INCIDENTIO_WEBHOOK = "remove_incidentio",
  REMOVE_PAGERDUTY = "remove_pagerduty",
}

export interface FilterOptions {
  tags?: string[];
  namePattern?: RegExp;
  messagePattern?: RegExp;
}

export interface MigrationOptions {
  dryRun?: boolean;
  type: MigrationType;
  singleWebhook?: boolean;
  verbose?: boolean;
  filter?: FilterOptions;
  validateMappings?: boolean;
}
