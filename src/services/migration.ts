import { DatadogService } from './datadog';
import { 
  DatadogMonitor, 
  MigrationMapping, 
  MigrationType,
  MigrationOptions,
  IncidentioConfig
} from '../types';

export class MigrationService {
  private datadogService: DatadogService;
  private incidentioConfig: IncidentioConfig;
  private mappings: MigrationMapping[];
  private dryRun: boolean;

  constructor(
    datadogService: DatadogService, 
    incidentioConfig: IncidentioConfig,
    mappings: MigrationMapping[] = [],
    options: { dryRun?: boolean } = {}
  ) {
    this.datadogService = datadogService;
    this.incidentioConfig = incidentioConfig;
    this.mappings = mappings;
    this.dryRun = options.dryRun || false;
  }

  private getPagerDutyPattern(): RegExp {
    // Match @pagerduty-ServiceName
    return /@pagerduty-(\S+)/g;
  }

  private getIncidentioWebhookPattern(): RegExp {
    // Match @webhook-incident-io or @webhook-incident-io-team-name
    return /@webhook-incident-io(-\S+)?/g;
  }

  private findPagerDutyServices(message: string): string[] {
    const matches = message.match(this.getPagerDutyPattern());
    if (!matches) return [];
    
    return matches.map(match => {
      // Extract the service name from @pagerduty-ServiceName
      const parts = match.split('-');
      return parts.slice(1).join('-');
    });
  }

  private findIncidentioWebhooks(message: string): string[] {
    const matches = message.match(this.getIncidentioWebhookPattern());
    return matches || [];
  }

  private getWebhookNameForTeam(team?: string): string {
    if (!team && this.incidentioConfig.defaultWebhook) {
      return this.incidentioConfig.defaultWebhook;
    }
    
    if (!team) {
      return 'webhook-incident-io';
    }

    return this.incidentioConfig.webhookNameFormat.replace('{team}', team);
  }

  private getTeamForPagerDutyService(service: string): string | undefined {
    const mapping = this.mappings.find(m => m.pagerdutyService === service);
    return mapping?.incidentioTeam;
  }

  async migrateMonitors(options: MigrationOptions): Promise<{ 
    processed: number, 
    updated: number, 
    unchanged: number,
    errors: { id: number, error: string }[] 
  }> {
    const monitors = await this.datadogService.getMonitors();
    
    let processed = 0;
    let updated = 0;
    let unchanged = 0;
    const errors: { id: number, error: string }[] = [];

    for (const monitor of monitors) {
      try {
        const result = await this.processMonitor(monitor, options);
        processed++;
        
        if (result.updated) {
          updated++;
        } else {
          unchanged++;
        }
      } catch (error) {
        errors.push({ 
          id: monitor.id, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    return { processed, updated, unchanged, errors };
  }

  async processMonitor(monitor: DatadogMonitor, options: MigrationOptions): Promise<{ 
    updated: boolean, 
    message?: string
  }> {
    const { message } = monitor;
    let newMessage = message;
    let updated = false;

    switch (options.type) {
      case MigrationType.ADD_INCIDENTIO_WEBHOOK:
        const pagerDutyServices = this.findPagerDutyServices(message);
        
        if (pagerDutyServices.length === 0) {
          return { updated: false, message: 'No PagerDuty services found' };
        }

        // Check if already has incident.io webhook
        const existingWebhooks = this.findIncidentioWebhooks(message);
        if (existingWebhooks.length > 0) {
          return { updated: false, message: 'Already has incident.io webhook' };
        }

        if (options.singleWebhook) {
          // Use default webhook for all
          const webhookName = this.getWebhookNameForTeam();
          newMessage = `${message} @${webhookName}`;
          updated = true;
        } else {
          // Map each PagerDuty service to a team webhook
          for (const service of pagerDutyServices) {
            const team = this.getTeamForPagerDutyService(service);
            const webhookName = this.getWebhookNameForTeam(team);
            
            if (!newMessage.includes(`@${webhookName}`)) {
              newMessage = `${newMessage} @${webhookName}`;
              updated = true;
            }
          }
        }
        break;

      case MigrationType.REMOVE_INCIDENTIO_WEBHOOK:
        const incidentWebhooks = this.findIncidentioWebhooks(message);
        
        if (incidentWebhooks.length === 0) {
          return { updated: false, message: 'No incident.io webhooks found' };
        }

        for (const webhook of incidentWebhooks) {
          newMessage = newMessage.replace(webhook, '').replace(/\s+/g, ' ').trim();
          updated = true;
        }
        break;

      case MigrationType.REMOVE_PAGERDUTY:
        const pdServices = this.findPagerDutyServices(message);
        
        if (pdServices.length === 0) {
          return { updated: false, message: 'No PagerDuty services found' };
        }

        const pdPattern = this.getPagerDutyPattern();
        newMessage = newMessage.replace(pdPattern, '').replace(/\s+/g, ' ').trim();
        updated = true;
        break;
    }

    if (updated && !this.dryRun) {
      await this.datadogService.updateMonitor(monitor.id, { message: newMessage });
    }

    return { updated, message: newMessage };
  }
}