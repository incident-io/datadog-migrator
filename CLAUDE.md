# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Deno CLI tool** that migrates Datadog monitor alerting from PagerDuty or Opsgenie to
incident.io. It operates exclusively through the **Datadog API** — PagerDuty, Opsgenie, and
incident.io are not called directly. Those providers exist only as `@mention` strings embedded in
Datadog monitor messages (e.g. `@pagerduty-my-service`, `@webhook-incident-io-my-team`). The tool
rewrites those strings and optionally manages Datadog webhook integrations and monitor tags.

Standard migration workflow:

1. `datadog-migrator init` — interactive setup; creates `config.json`, auto-detects provider services.
2. `datadog-migrator analyze` — read-only stats and mapping validation; safe to run any time.
3. `datadog-migrator add-incidentio` — adds incident.io webhook mentions (and optionally team tags).
4. `datadog-migrator remove-provider` — strips PagerDuty/Opsgenie mentions (destructive).

Optional intermediate step: `datadog-migrator remove-incidentio` undoes step 3.

## Runtime & Tooling

> **This is a Deno project.** `deno.jsonc` is the authoritative config. There is no `package.json`.
>
> The following files at the repo root are **vestigial** from an earlier Node prototype and are not
> used by the build, tests, or CI — ignore them: `yarn.lock`, `jest.config.js`, `tsconfig.json`,
> `eslint.config.js`, `.prettierrc`.

### Build and task commands

| Command | Purpose |
| :--- | :--- |
| `deno task dev` | Run with `--watch` (auto-restart on file change) |
| `deno task start` | Run without watch |
| `deno task build` | Compile to native binary `dist/datadog-migrator` (current platform) |
| `deno task build:all` | Cross-compile all four targets (mac x64, mac arm64, linux x64, win x64) |
| `deno task build:mac` | macOS Intel binary |
| `deno task build:mac-arm` | macOS Apple Silicon binary |
| `deno task build:linux` | Linux x86-64 binary |
| `deno task build:windows` | Windows x86-64 binary |
| `deno task lint` | `deno lint` (excludes `dist/`, `node_modules/`) |
| `deno task test` | Run all tests under `src/tests/` |
| `deno task test:watch` | Run tests in watch mode |

### Running a single test

```sh
# Run one file
deno test --allow-read --allow-write --allow-env src/tests/regex_test.ts

# Filter by test name substring
deno test --allow-read --allow-write --allow-env --filter "extracts service name" src/tests/
```

### Dependencies (from `deno.jsonc` imports)

| Package | Version | Role |
| :--- | :--- | :--- |
| Denomander (`deno.land/x/denomander`) | (locked) | CLI framework (not `commander`, which is in the import map but unused) |
| `@datadog/datadog-api-client` | 1.34.1 | Datadog API v1 client |
| `inquirer` | 12.5.2 | Interactive prompts (`init` command) |
| `ora` | 8.2.0 | Spinners |
| `kleur` | 4.1.5 | Terminal colours (note: `chalk` is also in the import map but unused in practice) |
| `figlet` + `boxen` | 1.8.1 / 8.0.1 | ASCII banner |
| `axios` | 1.8.4 | HTTP (indirect) |
| `@std/dotenv` | ^0.225.3 | `.env` loading |

## Directory Layout

```text
datadog-migrator/
├── .env.example              # DATADOG_API_KEY, DATADOG_APP_KEY, INCIDENTIO_WEBHOOK_TOKEN
├── deno.jsonc                # tasks, imports, lint, compilerOptions
├── deno.lock
├── .github/workflows/
│   ├── pr-tests.yml          # on PR: deno test, deno check, deno lint
│   └── build.yml             # on v* tag: test + compile 4 binaries + GitHub Release
└── src/
    ├── index.ts              # entrypoint — shebang, dotenv, banner, Denomander, 5 commands
    ├── commands/
    │   ├── init-config.ts    # `init` command (424 lines, includes auto-detection)
    │   ├── analyze.ts        # `analyze` command (505 lines)
    │   ├── add-incidentio.ts # `add-incidentio` command (117 lines)
    │   ├── remove-incidentio.ts
    │   └── remove-provider.ts
    ├── services/
    │   ├── datadog.ts        # Datadog API client wrapper (159 lines)
    │   └── migration.ts      # Core migration engine (875 lines) ← most logic lives here
    ├── types/
    │   ├── index.ts          # domain types: config, mappings, monitor, MigrationType, filters
    │   ├── cli.ts            # CLI option interfaces + centralised CommandOptions object
    │   └── prepareFilterOptions.ts
    ├── utils/
    │   ├── banner.ts         # displayBanner()
    │   ├── command.ts        # shared option setup, withErrorHandling, displayMigrationResults
    │   ├── config.ts         # loadConfig(), createDefaultConfig(), debug()
    │   ├── diff.ts           # ANSI highlight helpers for before/after diffs
    │   └── regex.ts          # provider regex constants + getServiceRegexForProvider()
    └── tests/
        ├── regex_test.ts
        ├── simple-metadata-test.ts
        ├── team-webhook-metadata-test.ts
        ├── commands/         # *.test.ts per command
        ├── migration-service/
        │   ├── additional-metadata.test.ts
        │   └── test-migration.ts  # ← helper/fixture, NOT a test file
        └── utils/
            ├── mock-datadog-service.ts
            ├── test-utils.ts
            ├── test-stub.ts
            └── mock-services.ts   # re-export shim of mock-datadog-service
```

## Entry Point & Command Flow

`src/index.ts` is a Deno shebang script. On startup it:

1. Loads `.env` via `@std/dotenv/load`.
2. Calls `displayBanner()` (`src/utils/banner.ts`).
3. Creates a `Denomander` program with app name and description.
4. Registers the five commands (each command file exports a `register*Command(program)` function).
5. Catches `SIGINT` for clean exit.
6. Calls `program.parse(Deno.args)`; shows help on error or no args.

### Shared option plumbing (`src/utils/command.ts` + `src/types/cli.ts`)

Options are defined once in `CommandOptions` (`cli.ts:55`) and applied by helpers in `command.ts`:

- `setupAuthOptions` — adds `-k/--api-key` (`DATADOG_API_KEY`) and `-a/--app-key` (`DATADOG_APP_KEY`).
- `setupFilterOptions` — adds `-t/--tags`, `-n/--name` (regex), `--message` (regex).
- `setupExecutionOptions` — adds `-d/--dry-run` and `-v/--verbose` (default `true`).
- All non-init commands also require `-c/--config`.
- `withErrorHandling(fn)` wraps each action: catches errors, prints in red, calls `Deno.exit`.
- `createDatadogService()` / `createMigrationService()` — construct the service layer.
- `displayMigrationResults()` — prints processed/updated/unchanged counts and coloured before/after diffs.

## The Five Commands

### `init` — `src/commands/init-config.ts`

Interactive config file generator.

Options: `--api-key`, `--app-key`, `--path` (default `./config.json`).

Workflow:

1. Checks if config file exists; prompts to overwrite.
2. Prompts (via inquirer) for: source provider (`pagerduty` | `opsgenie`), webhook strategy
   (single shared vs. team-per-webhook), team-tag strategy (if single webhook).
3. Prompts for incident.io alert source URL and webhook secret token (skipped if
   `INCIDENTIO_WEBHOOK_TOKEN` is set; strips the `Bearer` prefix or JSON header paste).
4. Writes initial config JSON.
5. Auto-detects provider services: fetches all Datadog monitors, regex-matches provider mentions,
   and writes a mapping stub per detected service with `incidentioTeam: null`.
   First mapping gets an `additionalMetadata` example.

### `analyze` — `src/commands/analyze.ts`

Read-only analysis; safe to run at any time.

Options: auth + filter + `--config` + `--show-monitors`.

Workflow: fetches monitors → applies filters → computes stats (monitors with provider-only,
incident.io-only, both, neither; per-service and per-webhook counts) → renders boxen summary →
`validateMappings` flags services with no mapping or `null` team. With `--show-monitors`, prints
per-monitor detail with highlighted mentions.

Note: help text in `analyze.ts:380` references a `generate-mappings` command that **does not exist**.

### `add-incidentio` — `src/commands/add-incidentio.ts`

Adds incident.io webhook mentions (and optionally team tags) to monitors that reference the provider.

Options: auth + filter + execution + `--config`.

When not `--dry-run`, shows an inquirer confirm describing the action, then calls
`migrationService.migrateMonitors({ type: MigrationType.ADD_INCIDENTIO_WEBHOOK, ... })`.

### `remove-incidentio` — `src/commands/remove-incidentio.ts`

Removes incident.io webhook mentions from monitors. Inverse of `add-incidentio`.

Options: same as `add-incidentio`. Simple yes/no confirm when not `--dry-run`.

### `remove-provider` — `src/commands/remove-provider.ts`

Strips all PagerDuty/Opsgenie `@mention` strings from monitors. **Destructive** — requires typing
`CONFIRM` exactly (not just y/n) before proceeding.

Options: same shape. Runs `MigrationType.REMOVE_PROVIDER`.

## Core: Migration Engine (`src/services/migration.ts`)

This 875-line file is where almost all transformation logic lives.

### Construction

`MigrationService` takes: a `DatadogService`, an `IncidentioConfig`, `mappings[]`, and `{ dryRun }`.
It tracks `createdWebhooks: Set<string>` to deduplicate webhook creation within a session.

### `migrateMonitors(options)` — `migration.ts:292`

Orchestrator: fetches monitors → applies `filterMonitors` (tags/name/message as case-insensitive
regexes) → validates mappings for `ADD_INCIDENTIO_WEBHOOK` → iterates monitors calling
`processMonitor` → aggregates a `MigrationResult` (`processed`, `updated`, `unchanged`, `changes`,
`errors`, `validationResults`).

### `processMonitor(monitor, options)` — `migration.ts:533`

Dispatches on `MigrationType`. Computes `newMessage` (and possibly `tagsAfter`); if `updated &&
!dryRun`, calls `datadogService.updateMonitor(monitor.id, { message: newMessage, [tags] })`. Dry-run
skips the API call.

### Migration types

#### `ADD_INCIDENTIO_WEBHOOK` — `migration.ts:557`

1. Find provider services via `findProviderServices`; bail (unchanged) if none.
2. Find existing incident.io webhook mentions.
3. **Single-webhook mode** (`!webhookPerTeam`): ensure the `incident-io` Datadog webhook exists via
   `ensureWebhookExists`; optionally add team/metadata tags; append or replace `@webhook-incident-io`.
4. **Team-specific mode** (`webhookPerTeam`): compute expected `@webhook-incident-io-<team>` mentions
   from mappings; ensure each team webhook exists; strip old mentions and append all expected ones.

> **Known bug:** in team-specific mode (~`migration.ts:696`), the mapping lookup is hardcoded to
> `m.pagerdutyService === service` and does not honour the Opsgenie source — unlike the
> single-webhook branch which uses the provider-aware `getMappingForService`. This means
> `add-incidentio` with `webhookPerTeam` silently skips team assignment when `source = "opsgenie"`.

#### `REMOVE_INCIDENTIO_WEBHOOK` — `migration.ts:769`

Finds all `@webhook-incident-io*` mentions and removes each, collapsing whitespace.

#### `REMOVE_PROVIDER` — `migration.ts:791`

Strips all `@pagerduty-*` / `@opsgenie-*` mentions via the provider regex, collapsing whitespace.

### Webhook naming helpers

- `getDatadogWebhookName(team?)` → `"incident-io"` or `"incident-io-<team>"` — the name of the
  Datadog Webhooks integration object.
- `getWebhookNameForTeam(team?)` → `"webhook-incident-io"` or `"webhook-incident-io-<team>"` — the
  in-message `@mention` string (without the `@`).

### `ensureWebhookExists` — `migration.ts:418`

Skips on dry-run and deduplicates via `createdWebhooks`. If the webhook doesn't exist in Datadog, it
creates one with the standard `$EVENT_TITLE` / `$ALERT_*` payload template, injecting a `"team"`
field (from the mapping) and any `additionalMetadata` key/value pairs as extra fields.

### Tag delineation — `migration.ts:605`

When `addTeamTags` is enabled, or any mapped service has `additionalMetadata`, the engine writes tags
directly onto the monitor in addition to (or instead of changing) the message:

- `createTeamTag(team)` → `"<teamTagPrefix>:<team>"` (default prefix: `"team"`).
- For each service: adds the team tag (if `addTeamTags && team`) and each `additionalMetadata` entry
  as a `key:value` tag, deduplicating against existing tags.
- If tags changed, sets `tagsAfter` and marks the monitor as updated — so monitors can be touched for
  tag-only changes even if the message is unchanged.

### Provider-aware helpers

- `findProviderServices(message)` — matches provider regex, splits on `-`, returns service names.
- `getMappingForService(service)` — branches on `source` to read `opsgenieService` vs
  `pagerdutyService` from each mapping.
- `validateProviderMappings` — requires all team mappings (no `null`, valid `^[a-z0-9-]+$` names)
  when `webhookPerTeam` **or** `addTeamTags` is enabled.

## Datadog API Client (`src/services/datadog.ts`)

Wraps `@datadog/datadog-api-client` v1 (`v1.MonitorsApi`, `v1.WebhooksIntegrationApi`). Requires
both `apiKey` and `appKey` at construction.

| Method | Notes |
| :--- | :--- |
| `getMonitors()` | `listMonitors({ groupStates: "all" })`; maps to `DatadogMonitor` shape |
| `updateMonitor(id, data)` | Partial payload — only `message`, `name`, `tags` if defined |
| `createWebhook(webhook)` | If `customHeaders` is a bare token (not `{`-prefixed), wraps it as `{"Authorization": "Bearer TOKEN"}` |
| `getWebhook(name)` | Returns `null` on any error (404 treated as "doesn't exist") |

## Provider Detection & Regex (`src/utils/regex.ts`)

```text
PAGERDUTY_SERVICE_REGEX  = /@pagerduty-([\w\-_]+)/g
OPSGENIE_SERVICE_REGEX   = /@opsgenie-([\w\-_]+)/g
```

`getServiceRegexForProvider(provider)` returns the Opsgenie regex for `"opsgenie"`, else PagerDuty.

The incident.io webhook pattern (inline in `migration.ts`): `/@webhook-incident-io(?:-[a-zA-Z0-9_-]+)*/g`.

### ONC-6420 overmatching fix (commit `a3ab62d`)

The original pattern used `\S+`, which greedily captured Datadog `{{...}}` template suffixes:
`@pagerduty-MyService{{/is_warning_recovery}}` → captured `MyService{{/is_warning_recovery}}` as the
service name. The fix narrows to `[\w\-_]+`, which stops at `{`, yielding just `MyService`. Covered
by tests in `src/tests/regex_test.ts`.

## Types & Config

### `src/types/index.ts` — domain model

```typescript
interface IncidentioConfig {
  webhookPerTeam: boolean;       // single shared webhook vs. one per team
  webhookUrl?: string;           // incident.io alert source URL
  webhookToken?: string;         // secret (or via INCIDENTIO_WEBHOOK_TOKEN env)
  addTeamTags?: boolean;         // write team tags onto monitors
  teamTagPrefix?: string;        // prefix for team tags, default "team"
  source?: 'pagerduty' | 'opsgenie';  // default "pagerduty"
}

interface MigrationMapping {
  pagerdutyService?: string;     // service name from @pagerduty-<name>
  opsgenieService?: string;      // service name from @opsgenie-<name>
  incidentioTeam?: string | null;  // null = not yet configured; flagged by analyze
  webhookName?: string;          // optional override for the Datadog webhook name
  additionalMetadata?: Record<string, string>;  // injected as tags and webhook payload fields
}

interface MigrationConfig {
  mappings: MigrationMapping[];
  incidentioConfig: IncidentioConfig;
}

interface DatadogMonitor {
  id: number;
  name: string;
  message: string;
  tags: string[];
}

enum MigrationType {
  ADD_INCIDENTIO_WEBHOOK,
  REMOVE_INCIDENTIO_WEBHOOK,
  REMOVE_PROVIDER,
}
```

### Config file example

```json
{
  "incidentioConfig": {
    "webhookPerTeam": false,
    "webhookUrl": "https://api.incident.io/v2/alert-sources/...",
    "webhookToken": "...",
    "addTeamTags": true,
    "teamTagPrefix": "team",
    "source": "pagerduty"
  },
  "mappings": [
    {
      "pagerdutyService": "my-service",
      "incidentioTeam": "platform",
      "additionalMetadata": { "service": "my-service" }
    },
    {
      "pagerdutyService": "another-service",
      "incidentioTeam": null
    }
  ]
}
```

### `loadConfig` (`src/utils/config.ts:11`)

Reads and parses the JSON config. Applies defaults for `incidentioConfig` and `mappings`.
Overrides `webhookToken` from `INCIDENTIO_WEBHOOK_TOKEN` env var if set. Uses Deno APIs
(`Deno.statSync`, `Deno.readTextFileSync`, `Deno.env`).

## Environment Variables

| Variable | Required | Purpose |
| :--- | :--- | :--- |
| `DATADOG_API_KEY` | Yes | Datadog API key (also accepted via `--api-key` flag) |
| `DATADOG_APP_KEY` | Yes | Datadog application key (also accepted via `--app-key` flag) |
| `INCIDENTIO_WEBHOOK_TOKEN` | No | Overrides `webhookToken` in config at load time |
| `DEBUG` | No | When set, enables verbose `debug()` logging in `config.ts` |

Copy `.env.example` to `.env` to populate these for local development.

## Testing

**Framework:** Deno's built-in test runner (`Deno.test` + `https://deno.land/std/testing/asserts.ts`).
Jest is **not used** despite `jest.config.js` existing.

Tests live under `src/tests/`. File naming is inconsistent — some are `*.test.ts`, others
`*_test.ts` or `*-test.ts`. `src/tests/migration-service/test-migration.ts` is a **helper/fixture
file**, not a test file itself.

### Test helpers (`src/tests/utils/`)

- `test-utils.ts` — factories: `createTestMonitor`, `createPagerDutyMonitor`, `createOpsgenieMonitor`,
  `createIncidentioMonitor`, `createMixedMonitor`, `createTestConfig`, `createTestMappings`.
- `mock-datadog-service.ts` — `MockDatadogService` with in-memory monitors/webhooks, tracks
  `updateCalls` and `webhookCalls`; `setMonitors`/`setWebhooks`/`reset`.
- `test-stub.ts` — `mockEnvGet`, `setupStubs()`, `withMockedEnv()` to stub `Deno.env.get`
  (provides `DEBUG=true`, `INCIDENTIO_WEBHOOK_TOKEN=test-token`).
- `mock-services.ts` — backward-compat re-export shim.

## CI

### `.github/workflows/pr-tests.yml`

Triggered on PRs to `master`/`main`. Runs:

1. `deno test src/tests/`
2. `deno check src/index.ts`
3. `deno lint`

### `.github/workflows/build.yml`

Triggered on `v*` tags or manual dispatch. Runs tests, then compiles all four binaries, uploads
them as artifacts, generates `SHA256SUMS.txt`, and creates a GitHub Release via
`softprops/action-gh-release`.

## Code Style Guidelines

- TypeScript with strict typing; explicit types on function params and return values.
- Imports: use relative paths (`.ts` extension required — this is Deno ESM, not CommonJS).
- Error handling: `try/catch` with `Error` instances and specific messages; CLI errors use
  `withErrorHandling` which prints in red and exits.
- Naming: `camelCase` for variables/functions, `PascalCase` for classes/interfaces/enums.
- File structure: feature-organized under `commands/`, `services/`, `types/`, `utils/`.
- `async/await` preferred over raw Promises.
- Declarative/functional patterns where appropriate.
- Proper error handling is critical for CLI operations — a failed update should not silently
  corrupt migration state.
