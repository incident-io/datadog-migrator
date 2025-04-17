import {client, v1} from '@datadog/datadog-api-client';
import {DatadogConfig, DatadogCredentials, DatadogMonitor} from '../types';
import {debug} from '../utils/config';

export class DatadogService {
    private apiInstance: v1.MonitorsApi;
    private webhooksInstance: v1.WebhooksIntegrationApi;

    constructor(config: DatadogConfig & Partial<DatadogCredentials>, credentials?: DatadogCredentials) {
        // Get API credentials from arguments
        const apiKey = credentials?.apiKey || config.apiKey;
        const appKey = credentials?.appKey || config.appKey;

        // Log credentials info without assuming format
        debug("Creating DatadogService with credentials", {
            apiKeyType: typeof apiKey,
            appKeyType: typeof appKey,
            apiKeyPresent: !!apiKey,
            appKeyPresent: !!appKey
        });

        // Validate credentials
        if (!apiKey || !appKey) {
            throw new Error("Missing API credentials - both apiKey and appKey are required");
        }

        // Configure the client - using environment variables is also supported by the client
        const configuration = client.createConfiguration({
            authMethods: {
                apiKeyAuth: apiKey,
                appKeyAuth: appKey,
            }
        });

        debug("Created Datadog API client configuration");

        // Create API instances
        this.apiInstance = new v1.MonitorsApi(configuration);
        this.webhooksInstance = new v1.WebhooksIntegrationApi(configuration);

        debug("Initialized Datadog API clients");
    }

    async getMonitors(): Promise<DatadogMonitor[]> {
        try {
            const response = await this.apiInstance.listMonitors({
                groupStates: 'all',
            });

            // Transform to our internal format
            return response.map(monitor => ({
                id: monitor.id as number,
                name: monitor.name as string,
                message: monitor.message as string,
                tags: monitor.tags as string[] || [],
            }));
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to fetch monitors: ${error.message}`);
            }
            throw error;
        }
    }

    async updateMonitor(id: number, data: Partial<DatadogMonitor>): Promise<DatadogMonitor> {
        try {
            // Prepare update payload
            const updatePayload: v1.MonitorUpdateRequest = {};

            if (data.message !== undefined) {
                updatePayload.message = data.message;
            }

            if (data.name !== undefined) {
                updatePayload.name = data.name;
            }

            if (data.tags !== undefined) {
                updatePayload.tags = data.tags;
            }

            debug(`Updating monitor ${id} with payload: ${JSON.stringify(updatePayload)}`);
            // Safely log API key info without assuming it's a string
            const apiKey = this.apiInstance.configuration.authMethods.apiKeyAuth;
            const appKey = this.apiInstance.configuration.authMethods.appKeyAuth;
            debug(`API key type: ${typeof apiKey}, App key type: ${typeof appKey}`);

            try {
                // Just verify we have some credentials without checking their format
                if (!this.apiInstance.configuration.authMethods) {
                    throw new Error("Missing API configuration");
                }

                debug(`Sending API request to update monitor ${id}`);

                // Update the monitor
                const response = await this.apiInstance.updateMonitor({
                    monitorId: id,
                    body: updatePayload
                });

                debug(`Update response for monitor ${id}: ${JSON.stringify(response)}`);
                return {
                    id: response.id as number,
                    name: response.name as string,
                    message: response.message as string,
                    tags: response.tags as string[] || [],
                };
            } catch (apiError) {
                debug(`CRITICAL - API ERROR for monitor ${id}: ${String(apiError)}`);
                console.error(`API ERROR for monitor ${id}:`, apiError);
                throw apiError;
            }
        } catch (error) {
            debug(`Error updating monitor ${id}: ${String(error)}`);
            console.error(`Error updating monitor ${id}:`, error);
            if (error instanceof Error) {
                throw new Error(`Failed to update monitor ${id}: ${error.message}`);
            }
            throw error;
        }
    }

    // Method to check if webhooks are configured
    async getWebhooks(): Promise<Record<string, v1.WebhooksIntegrationCustomVariable>> {
        try {
            const response = await this.webhooksInstance.getWebhooksIntegration();
            return response.webhooks || {};
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to fetch webhooks: ${error.message}`);
            }
            throw error;
        }
    }

    // Method to create a webhook if needed
    async createWebhook(name: string, url: string): Promise<v1.WebhooksIntegrationCustomVariable | null> {
        try {
            // First get the current webhooks
            const currentWebhooks = await this.getWebhooks();

            // Check if the webhook already exists
            if (currentWebhooks[name]) {
                return currentWebhooks[name];
            }

            // Add our new webhook to the list
            const webhook: v1.WebhooksIntegrationCustomVariable = {
                url,
                name,
                encode_as: 'json',
            };

            const updatedWebhooks = {...currentWebhooks, [name]: webhook};

            // Update the webhooks configuration
            const response = await this.webhooksInstance.updateWebhooksIntegration({
                body: {
                    webhooks: updatedWebhooks
                }
            });

            return response.webhooks && response.webhooks[name] ? response.webhooks[name] : null;
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to create webhook ${name}: ${error.message}`);
            }
            throw error;
        }
    }
}