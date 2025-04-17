import axios from 'axios';
import { DatadogConfig, DatadogMonitor } from '../types';

export class DatadogService {
  private apiKey: string;
  private appKey: string;
  private baseUrl: string;

  constructor(config: DatadogConfig) {
    this.apiKey = config.apiKey;
    this.appKey = config.appKey;
    this.baseUrl = config.baseUrl || 'https://api.datadoghq.com/api/v1';
  }

  private getHeaders() {
    return {
      'DD-API-KEY': this.apiKey,
      'DD-APPLICATION-KEY': this.appKey,
      'Content-Type': 'application/json',
    };
  }

  async getMonitors(): Promise<DatadogMonitor[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/monitor`, {
        headers: this.getHeaders(),
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to fetch monitors: ${error.message}`);
      } else {
        throw error;
      }
    }
  }

  async updateMonitor(id: number, data: Partial<DatadogMonitor>): Promise<DatadogMonitor> {
    try {
      const response = await axios.put(`${this.baseUrl}/monitor/${id}`, data, {
        headers: this.getHeaders(),
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to update monitor ${id}: ${error.message}`);
      } else {
        throw error;
      }
    }
  }

  // Method to check if webhooks are configured
  async getWebhooks(): Promise<any[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/integration/webhooks/configuration`, {
        headers: this.getHeaders(),
      });
      return response.data || [];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to fetch webhooks: ${error.message}`);
      } else {
        throw error;
      }
    }
  }

  // Method to create a webhook if needed
  async createWebhook(name: string, url: string): Promise<any> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/integration/webhooks/configuration/webhooks`,
        {
          name,
          url,
          encode_as: 'json',
        },
        {
          headers: this.getHeaders(),
        }
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to create webhook ${name}: ${error.message}`);
      } else {
        throw error;
      }
    }
  }
}