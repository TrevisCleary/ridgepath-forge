# RidgePath Forge Workflow Contract

## Purpose

This document defines the workflow contract between RidgePath Forge and Codex Operations Library.

The Operations Library is the source of truth for prompts, standards, workflow references, and handoff templates. RidgePath Forge is responsible for local project creation, registry state, UI, visualization, and local operations.

## Configuration Source

RidgePath Forge workflow references are configured in:

```text
launcher-settings.json
```

The active Operations Library root comes from:

1. `OPERATIONS_LIBRARY_ROOT` environment variable, when set.
2. `launcher-settings.json.operationsLibrary.root`.
3. Built-in fallback used only when settings are unavailable.

## Workflow References

| Workflow | Prompt Path | Expected Inputs | Expected Outputs |
| --- | --- | --- | --- |
| Start New Project | `prompts/start-new-project.md` | Project identity, problem statement, desired outcome, source artifacts, technology preferences | `project-initiation.md`, `project-source/`, `bootstrap-config.md`, `docs/launcher-handoff.md`, `codex-next-prompt.md` |
| Onboard Existing Project | `prompts/onboard-existing-project.md` | Repository path, application purpose, owner, documentation sources | Onboarding summary, source reconciliation notes, governance assessment, standardization plan |
| Project Initiation | `prompts/project-initiation-prompt.md` | `project-initiation.md`, `project-source/`, `bootstrap-config.md` | Discovery notes, readiness assessment, carry-forward questions |

## Template References

Configured template paths are relative to the Operations Library root.

| Artifact | Template Setting | Default Template Path |
| --- | --- | --- |
| Bootstrap config | `templates.bootstrapConfig` | `templates/bootstrap/launcher-bootstrap-config-template.md` |
| Launcher handoff | `templates.launcherHandoff` | `templates/handoff/launcher-handoff-template.md` |
| Legacy Operations Library handoff | `templates.legacyOperationsLibraryHandoff` | `templates/handoff/operations-library-handoff-template.md` |
| Governance bootstrap | `templates.governanceBootstrap` | `templates/governance/launcher-governance-bootstrap-template.md` |
| Project initiation | `templates.projectInitiation` | `templates/project-initiation-template.md` |
| Project source README | `templates.projectSourceReadme` | `templates/project-source-readme-template.md` |
| Next Codex prompt | `templates.codexNextPrompt` | `templates/handoff/codex-next-prompt-template.md` |

## RidgePath Forge Responsibilities

- Capture local registration inputs.
- Create the local project folder.
- Create local starter runtime files.
- Render configured Operations Library templates.
- Store registry metadata.
- Display Operations Library contract status.
- Preserve local service operations.

## Operations Library Responsibilities

- Own prompt text and workflow definitions.
- Own handoff, bootstrap, governance, project initiation, and next-prompt templates.
- Own standards and lifecycle guidance.
- Own Project Management schema expectations.
- Provide stable template and prompt paths or update `launcher-settings.json` when paths change.

## Validation Behavior

RidgePath Forge validates:

- Operations Library root exists.
- Required folders exist.
- Required files exist.
- Configured templates exist.
- Configured workflow prompt paths exist.
- Project Management dashboard schema versions are configured.

Validation status values:

- `Valid`: required assets, templates, prompts, and schema settings are available.
- `Warning`: required root/files are present, but optional configured templates or prompts are missing.
- `Invalid`: root is missing, required folders/files are missing, or schema support is not configured.

Project registration requires the Operations Library contract to not be `Invalid` because registration renders templates from the library.
