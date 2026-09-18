import { client, v1 } from "@datadog/datadog-api-client";
import { DatadogMonitor } from "../types/index.ts";
import { debug } from "../utils/config.ts";

interface DatadogWebhook {
  name: string;
  url: string;
  payload: string;
  customHeaders?: string;
}

export class DatadogService {
  private monitorsApi: v1.MonitorsApi;
  private webhooksApi: v1.WebhooksIntegrationApi;

  constructor({ apiKey, appKey }: { apiKey: string; appKey: string }) {
    // Validate credentials
    if (!apiKey || !appKey) {
      throw new Error(
        "Missing API credentials - both apiKey and appKey are required",
      );
    }

    const site = Deno.env.get("DATADOG_SITE") || "datadoghq.com";

    const configuration = client.createConfiguration({
      authMethods: {
        apiKeyAuth: apiKey,
        appKeyAuth: appKey,
      },
    });
    configuration.setServerVariables({ site });

    debug("Created Datadog API client configuration");

    this.monitorsApi = new v1.MonitorsApi(configuration);
    this.webhooksApi = new v1.WebhooksIntegrationApi(configuration);
  }

  async getMonitors(): Promise<DatadogMonitor[]> {
    try {
      const response = await this.monitorsApi.listMonitors({
        groupStates: "all",
      });

      // Transform to our internal format
      return response.map((monitor) => ({
        id: monitor.id as number,
        name: monitor.name as string,
        message: monitor.message as string,
        tags: (monitor.tags as string[]) || [],
      }));
    } catch (error) {
      if (error instanceof Error) {
        const hint = error.message.includes("403")
          ? "\nEnsure the Datadog application key has the monitors_read scope."
          : "";
        throw new Error(`Failed to fetch monitors: ${error.message}${hint}`);
      }
      throw error;
    }
  }

  async updateMonitor(
    id: number,
    data: Partial<DatadogMonitor>,
  ): Promise<DatadogMonitor> {
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

      debug(
        `Updating monitor ${id} with payload: ${JSON.stringify(updatePayload)}`,
      );

      try {
        debug(`Sending API request to update monitor ${id}`);

        // Update the monitor
        const response = await this.monitorsApi.updateMonitor({
          monitorId: id,
          body: updatePayload,
        });

        debug(`Update response for monitor ${id}: ${JSON.stringify(response)}`);
        return {
          id: response.id as number,
          name: response.name as string,
          message: response.message as string,
          tags: (response.tags as string[]) || [],
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
        const hint = error.message.includes("403")
          ? "\nEnsure the Datadog application key has the monitors_write scope."
          : "";
        throw new Error(`Failed to update monitor ${id}: ${error.message}${hint}`);
      }
      throw error;
    }
  }

  async createWebhook(webhook: DatadogWebhook): Promise<void> {
    try {
      debug(`Creating webhook: ${webhook.name}`);

      // Format custom headers as JSON if it's not already
      let headers = webhook.customHeaders;
      if (headers && !headers.startsWith("{")) {
        headers = JSON.stringify({ Authorization: `Bearer ${headers}` });
      }

      await this.webhooksApi.createWebhooksIntegration({
        body: {
          name: webhook.name,
          url: webhook.url,
          payload: webhook.payload,
          customHeaders: headers,
          encodeAs: "json",
        },
      });
      debug(`Successfully created webhook: ${webhook.name}`);
    } catch (error) {
      debug(`Error creating webhook ${webhook.name}: ${String(error)}`);
      console.error(`Error creating webhook ${webhook.name}:`, error);
      if (error instanceof Error) {
        const hint = error.message.includes("403")
          ? "\nEnsure the Datadog application key has the integrations_write scope."
          : "";
        throw new Error(`Failed to create webhook ${webhook.name}: ${error.message}${hint}`);
      }
      throw error;
    }
  }

  async getWebhook(name: string): Promise<v1.WebhooksIntegration | null> {
    try {
      debug(`Getting webhook: ${name}`);
      const webhook = await this.webhooksApi.getWebhooksIntegration({
        webhookName: name,
      });
      return webhook;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("403")) {
          throw new Error(
            `Failed to get webhook ${name}: ${error.message}\nEnsure the Datadog application key has the integrations_read scope.`,
          );
        }
        // Treat anything else (404, network hiccup) as "doesn't exist"
      }
      debug(`Webhook ${name} not found or error: ${String(error)}`);
      return null;
    }
  }
}
