# Datadog Alert Migrator

A CLI tool to help migrate Datadog monitors over from PagerDuty or Opsgenie to incident.io.

## Features

- Add incident.io webhooks to monitors that currently use PagerDuty or Opsgenie
- Remove incident.io webhooks from monitors
- Remove PagerDuty or Opsgenie service mentions from monitors
- Support for team-specific webhook mapping
- Add team tags to monitors based on provider service mappings
- Support for additional metadata in webhook payloads
- Automatic webhook creation in Datadog
- Configuration via command line, interactive prompts, or config file
- Dry run mode to preview changes without modifying monitors
- Tag-based filtering of monitors

## Installation

### Download the binary

You can download the latest binary release from the [GitHub Releases](https://github.com/incident-io/datadog-migrator/releases) page.

Choose the appropriate binary for your system:
- **macOS Intel**: `datadog-migrator-macos-x64-VERSION`
- **macOS Apple Silicon**: `datadog-migrator-macos-arm64-VERSION`
- **Linux**: `datadog-migrator-linux-x64-VERSION`
- **Windows**: `datadog-migrator-windows-x64-VERSION.exe`

Where `VERSION` is the version number (e.g., `1.0.0`).

You can verify the integrity of the downloaded binary using the `SHA256SUMS.txt` file provided with each release.

Make the binary executable (Linux/macOS):

```bash
chmod +x ./datadog-migrator-*
```

You can then move the binary to a directory in your PATH, for example:

```bash
sudo mv ./datadog-migrator-darwin-arm64 /usr/local/bin/datadog-migrator
```

## Usage

```bash
# Initialize a new configuration
datadog-migrator init

# Add incident.io webhooks to monitors using PagerDuty or Opsgenie
datadog-migrator add-incidentio --api-key YOUR_API_KEY --app-key YOUR_APP_KEY --config config.json

# Remove incident.io webhooks from monitors
datadog-migrator remove-incidentio --api-key YOUR_API_KEY --app-key YOUR_APP_KEY --config config.json

# Remove PagerDuty or Opsgenie mentions from monitors
datadog-migrator remove-provider --api-key YOUR_API_KEY --app-key YOUR_APP_KEY --config config.json

# Analyze monitors without making changes
datadog-migrator analyze --api-key YOUR_API_KEY --app-key YOUR_APP_KEY --config config.json
```

## Commands

### init

Initialize a new configuration file with interactive prompts:

```bash
datadog-migrator init
```

Options:
- `-k, --api-key <key>` - Datadog API key
- `-a, --app-key <key>` - Datadog App key
- `--path <path>` - Path to save the config file (default: ./config.json)

The init command will:
1. Ask which provider you're migrating from (PagerDuty or Opsgenie)
2. Ask how you want to tag incident.io webhooks (single webhook or team-specific)
3. If using a single webhook, ask if you want to add team tags to monitors
4. Collect incident.io alert source URL and webhook token
5. Scan for PagerDuty or Opsgenie services in your monitors
6. Create a config file with mappings template

### add-incidentio

Add incident.io webhooks to monitors that currently use PagerDuty or Opsgenie:

```bash
datadog-migrator add-incidentio
```

Options:
- `-k, --api-key <key>` - Datadog API key
- `-a, --app-key <key>` - Datadog App key
- `-c, --config <path>` - Path to config file
- `-d, --dry-run` - Dry run mode (no actual changes)
- `-s, --single-webhook` - Use a single webhook for all monitors
- `-v, --verbose` - Show detailed output
- `-t, --tags <tags>` - Filter monitors by tags (comma-separated)
- `-n, --name <pattern>` - Filter monitors by name pattern
- `--message <pattern>` - Filter monitors by message pattern

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
- `-v, --verbose` - Show detailed output
- `-t, --tags <tags>` - Filter monitors by tags (comma-separated)
- `-n, --name <pattern>` - Filter monitors by name pattern
- `--message <pattern>` - Filter monitors by message pattern

### remove-provider

Remove PagerDuty or Opsgenie service mentions from monitors:

```bash
datadog-migrator remove-provider
```

Options:
- `-k, --api-key <key>` - Datadog API key
- `-a, --app-key <key>` - Datadog App key
- `-c, --config <path>` - Path to config file
- `-d, --dry-run` - Dry run mode (no actual changes)
- `-v, --verbose` - Show detailed output
- `-t, --tags <tags>` - Filter monitors by tags (comma-separated)
- `-n, --name <pattern>` - Filter monitors by name pattern
- `--message <pattern>` - Filter monitors by message pattern

### analyze

Analyze monitors to find PagerDuty or Opsgenie services and incident.io webhooks without making changes:

```bash
datadog-migrator analyze
```

Options:
- `-k, --api-key <key>` - Datadog API key
- `-a, --app-key <key>` - Datadog App key
- `-c, --config <path>` - Path to config file
- `-v, --verbose` - Show detailed output
- `-t, --tags <tags>` - Filter monitors by tags (comma-separated)
- `-n, --name <pattern>` - Filter monitors by name pattern
- `--message <pattern>` - Filter monitors by message pattern

## Configuration

You can configure the tool using a JSON configuration file. The tool will create this for you when you run the `init` command.

```json
{
  "incidentioConfig": {
    "webhookPerTeam": false,
    "webhookUrl": "https://api.incident.io/v2/alerts/incoming/123456789",
    "webhookToken": "your_webhook_token",
    "addTeamTags": true,
    "teamTagPrefix": "team",
    "source": "pagerduty"
  },
  "mappings": [
    {
      "pagerdutyService": "database-service",
      "incidentioTeam": "platform",
      "additionalMetadata": {
        "priority": "high",
        "service": "database"
      }
    },
    {
      "pagerdutyService": "api-service-critical",
      "incidentioTeam": "api",
      "additionalMetadata": {
        "priority": "high",
        "service": "api"
      }
    },
    {
      "pagerdutyService": "api-service-non-critical",
      "incidentioTeam": "api",
      "additionalMetadata": {
        "priority": "low",
        "service": "api"
      }
    }
  ]
}
```

### Configuration Options

- `webhookPerTeam`: Whether to use team-specific webhooks (true) or a single webhook (false)
- `webhookUrl`: The URL for your incident.io alert source
- `webhookToken`: The secret token for your incident.io alert source
- `addTeamTags`: (Optional) Whether to add team tags to monitors when using single webhook mode
- `teamTagPrefix`: (Optional) The prefix to use for team tags (default: "team")
- `source`: (Optional) The provider you're migrating from ("pagerduty" or "opsgenie", default: "pagerduty")
- `mappings`: An array of mappings from provider service names to incident.io team names
  - `pagerdutyService`: The provider service name (PagerDuty or Opsgenie)
  - `incidentioTeam`: The incident.io team name to route alerts to
  - `additionalMetadata`: (Optional) Additional metadata fields to include in webhook payloads or as tags

### Additional Metadata

The `additionalMetadata` field allows you to include extra metadata in your incident.io alerts. This is useful for:

1. Adding priority information to distinguish between critical and non-critical alerts
2. Adding service information when multiple provider services map to the same team
3. Including environment details or other contextual information

When using team-specific webhooks, this metadata is included directly in the webhook payload. When using a single webhook with team tags, these values are also added as tags to the monitor in the format `key:value`.

## Environment Variables

You can also use environment variables for configuration:

```
DATADOG_API_KEY=your_api_key_here
DATADOG_APP_KEY=your_app_key_here
```

## Building from source

If you want to build the binaries yourself:

1. Clone the repository
2. Install [Deno](https://deno.land/#installation) if you don't have it already
3. Build the project with:
   ```bash
   deno task build
   ```
4. Or build platform-specific binaries:
   ```bash
   deno task build:mac      # macOS Intel
   deno task build:mac-arm  # macOS Apple Silicon
   deno task build:linux    # Linux
   deno task build:windows  # Windows
   ```

The binaries will be available in the `dist` directory.

## Releasing new versions

To create a new release:

1. Update the version in `package.json`
2. Create a git tag for the version:
   ```bash
   git tag v1.0.0  # Replace with your version
   ```
3. Push the tag to GitHub:
   ```bash
   git push origin v1.0.0
   ```
4. The GitHub Actions workflow will automatically build binaries and create a release

## License

MIT
