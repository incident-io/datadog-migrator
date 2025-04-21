import { client, v1 } from "@datadog/datadog-api-client";
import { DatadogMonitor } from "@/types";
import { debug } from "@/utils/config";

export class DatadogService {
  private monitorsApi: v1.MonitorsApi;

  constructor({ apiKey, appKey }: { apiKey: string; appKey: string }) {
    // Validate credentials
    if (!apiKey || !appKey) {
      throw new Error(
        "Missing API credentials - both apiKey and appKey are required",
      );
    }

    // Configure the client - using environment variables is also supported by the client
    const configuration = client.createConfiguration({
      authMethods: {
        apiKeyAuth: apiKey,
        appKeyAuth: appKey,
      },
    });

    debug("Created Datadog API client configuration");

    this.monitorsApi = new v1.MonitorsApi(configuration);
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
        throw new Error(`Failed to fetch monitors: ${error.message}`);
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
        throw new Error(`Failed to update monitor ${id}: ${error.message}`);
      }
      throw error;
    }
  }
}
