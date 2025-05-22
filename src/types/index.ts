export interface IncidentioConfig {
  webhookPerTeam: boolean;
  webhookUrl?: string;
  webhookToken?: string;
  addTeamTags?: boolean;
  teamTagPrefix?: string;
  source: 'pagerduty' | 'opsgenie';
}

export interface MigrationMapping {
  pagerdutyService?: string;
  opsgenieService?: string;
  incidentioTeam?: string | null;
  webhookName?: string;
  additionalMetadata?: Record<string, string>;
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
}

export enum MigrationType {
  ADD_INCIDENTIO_WEBHOOK = "add_incidentio",
  REMOVE_INCIDENTIO_WEBHOOK = "remove_incidentio",
  REMOVE_PROVIDER = "remove_provider",
}

export interface FilterOptions {
  tags?: string[];
  name?: string;
  message?: string;
}

export interface MigrationOptions {
  dryRun?: boolean;
  type: MigrationType;
  webhookPerTeam?: boolean;
  verbose?: boolean;
  filter?: FilterOptions;
}
