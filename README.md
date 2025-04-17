# Datadog Migrator

A CLI tool to help migrate Datadog monitors between notification systems, specifically designed for transitioning between PagerDuty and incident.io.

## Features

- Add incident.io webhooks to monitors that currently use PagerDuty
- Remove incident.io webhooks from monitors
- Remove PagerDuty service mentions from monitors
- Support for team-specific webhook mapping
- Configuration via command line, interactive prompts, or config file
- Dry run mode to preview changes without modifying monitors

## Installation

### Using npm/yarn globally

```bash
# Using npm
npm install -g datadog-migrator

# Using yarn
yarn global add datadog-migrator
```

### Running directly with npx

```bash
npx datadog-migrator [command]
```

## Usage

```bash
# Initialize a new configuration
datadog-migrator init

# Add incident.io webhooks to monitors using PagerDuty
datadog-migrator add-incidentio --api-key YOUR_API_KEY --app-key YOUR_APP_KEY

# Remove incident.io webhooks from monitors
datadog-migrator remove-incidentio --api-key YOUR_API_KEY --app-key YOUR_APP_KEY

# Remove PagerDuty mentions from monitors
datadog-migrator remove-pagerduty --api-key YOUR_API_KEY --app-key YOUR_APP_KEY
```

## Commands

### init

Initialize a new configuration file with interactive prompts:

```bash
datadog-migrator init
```

Options:
- `--path <path>` - Path to save the config file (default: ./config.json)

### add-incidentio

Add incident.io webhooks to monitors that currently use PagerDuty:

```bash
datadog-migrator add-incidentio
```

Options:
- `-k, --api-key <key>` - Datadog API key
- `-a, --app-key <key>` - Datadog App key
- `-c, --config <path>` - Path to config file
- `-m, --mapping <path>` - Path to mapping file
- `-d, --dry-run` - Dry run mode (no actual changes)
- `-s, --single-webhook` - Use a single webhook for all monitors

### remove-incidentio

Remove incident.io webhooks from monitors:

```bash
datadog-migrator remove-incidentio
```

Options:
- `-k, --api-key <key>` - Datadog API key
- `-a, --app-key <key>` - Datadog App key
- `-c, --config <path>` - Path to config file
- `-d, --dry-run` - Dry run mode (no actual changes)

### remove-pagerduty

Remove PagerDuty service mentions from monitors:

```bash
datadog-migrator remove-pagerduty
```

Options:
- `-k, --api-key <key>` - Datadog API key
- `-a, --app-key <key>` - Datadog App key
- `-c, --config <path>` - Path to config file
- `-d, --dry-run` - Dry run mode (no actual changes)

## Configuration

You can configure the tool using a JSON configuration file:

```json
{
  "datadogConfig": {
    "apiKey": "your_api_key",
    "appKey": "your_app_key",
    "baseUrl": "https://api.datadoghq.com/api/v1"
  },
  "incidentioConfig": {
    "webhookNameFormat": "webhook-incident-io-{team}",
    "defaultWebhook": "webhook-incident-io"
  },
  "mappings": [
    {
      "pagerdutyService": "Database",
      "incidentioTeam": "platform"
    },
    {
      "pagerdutyService": "API",
      "incidentioTeam": "api"
    }
  ]
}
```

## Environment Variables

You can also use environment variables for configuration. Create a `.env` file based on the provided `.env.example`:

```
DATADOG_API_KEY=your_api_key_here
DATADOG_APP_KEY=your_app_key_here
DATADOG_BASE_URL=https://api.datadoghq.com/api/v1
```

## License

MIT