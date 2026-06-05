# Project Management Contract

## Purpose

This document defines the configurable Project Management contract between RidgePath Forge and Codex Operations Library.

RidgePath Forge visualizes project-owned Project Management state. It does not own roadmap, sprint, portfolio, GitHub, or editing workflows.

## Configuration Source

Project Management settings are configured in:

```text
launcher-settings.json.projectManagement
```

## Directory Structure

Default Project Management directory:

```text
docs/project-management/
```

Default dashboard file:

```text
docs/project-management/project-dashboard.json
```

The directory and dashboard filename are configurable:

- `projectManagement.directory`
- `projectManagement.dashboardFileName`

## Required Files

For initialized Project Management visibility:

```text
project-dashboard.json
```

The dashboard is read from the configured Project Management directory.

## Optional Files

RidgePath Forge can open these files when they exist:

```text
lifecycle-status.md
backlog.md
bugs.md
codex-activity.md
```

These filenames are configured in:

```text
projectManagement.openFiles
```

## Source Files

The dashboard contract uses:

```json
metadata.sourceFiles
```

Each listed source file is validated against the project root. Files outside the project root are treated as missing. Files newer than the dashboard mark the dashboard as stale.

## Supported Schema Versions

Supported versions are configured in:

```text
projectManagement.supportedDashboardSchemaVersions
```

Current default:

```text
1.1
```

## Required Dashboard Fields

RidgePath Forge requires:

- `schemaVersion`
- `project`
- `summary.currentPhase`
- `summary.lifecycleStatus`
- `summary.governanceStatus`
- `summary.currentSprint`
- `summary.nextCodexAction`
- `counts.backlogOpen`
- `counts.bugsOpen`
- `counts.sprintBlocked`
- `governance`
- `metadata.generatedAt`
- `metadata.sourceFiles`

## Read Behavior

- Read the dashboard JSON first.
- Validate schema version.
- Validate required fields.
- Validate source file references.
- Compare source file modified times against dashboard modified time.
- Display stale or missing data as `Needs Manual Review`.
- Do not infer missing values.

## Versioning Expectations

- Operations Library owns schema evolution.
- RidgePath Forge settings declare supported schema versions.
- New schema versions should be added to settings only after RidgePath Forge compatibility is verified.
- Unsupported versions should render as `Needs Manual Review`, not as successful data.

## Out Of Scope

This contract does not implement:

- Roadmap tab.
- Sprint tab.
- Portfolio dashboard.
- GitHub sync.
- RidgePath Forge-side editing.
