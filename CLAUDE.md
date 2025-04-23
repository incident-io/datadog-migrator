# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
This is a CLI tool to help automatically migrating Datadog monitors from PagerDuty to incident.io. It is generally run
in the following steps:

1. `datadog-migrator init` - creates a config file
2. `datadog-migrator analyze` - shows the progress of a migration and provides stats on the number of monitors
3. `datadog-migrator add-incidentio` - adds incident.io references to the Datadog monitors
4. `datadog-migrator remove-pagerduty` - removes PagerDuty references from the Datadog monitors

## Build Commands
- Build: `yarn build` or `deno task build`
- Dev: `yarn dev` or `deno task dev`
- Test: `yarn test` (runs Jest tests)
- Lint: `yarn lint` (runs ESLint)
- Format: `yarn format` (runs Prettier and ESLint)
- Run single test: `yarn test -t 'test name pattern'`

## Code Style Guidelines
- TypeScript with strict typing, use explicit types for function params and returns
- Imports: Use relative paths for local modules
- Error handling: Use try/catch with Error instances and specific error messages
- Naming: camelCase for variables/functions, PascalCase for classes/interfaces
- File structure: Organized by feature (commands/, services/, types/, utils/)
- Async/await preferred over Promises
- ES2022 modern JavaScript features supported
- Use declarative functional patterns where appropriate
- Proper error handling is critical for CLI operations