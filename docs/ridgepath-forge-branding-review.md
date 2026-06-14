# RidgePath Forge Branding Review

## Summary

The product-facing brand is now:

- Product name: RidgePath Forge
- Tagline: Application Delivery Platform

This pass updates user-facing product identity while preserving compatibility-sensitive launcher terminology in file paths, environment variables, template keys, hostnames, and historical implementation records.

## Files Updated

| File | Update |
| --- | --- |
| `README.md` | Rebranded title, summary, behavior descriptions, registration copy, refresh copy, and legacy hostname explanation. |
| `index.html` | Updated browser title, application metadata, and page description. |
| `public/site.webmanifest` | Updated installable app name and short name. |
| `package.json` | Updated package name to `ridgepath-forge`. |
| `package-lock.json` | Updated root package name to `ridgepath-forge`. |
| `src/main.jsx` | Updated header product name, tagline, empty states, output copy, and registration note. |
| `server/index.js` | Updated generated starter project README/server copy, Project Management initialization prompt text, fallback generated-by values, runtime errors, logs, and API startup message. |
| `server/redirect.js` | Updated redirect console messages. |
| `scripts/register-startup-task.ps1` | Updated scheduled task name and description. |
| `scripts/register-startup-folder.ps1` | Updated Startup folder command name and window title. |
| `scripts/register-hostnames.ps1` | Updated hosts-file comment while preserving hostnames. |
| `docs/launcher-workflow-contract.md` | Rebranded active workflow contract to RidgePath Forge. |
| `docs/project-management-contract.md` | Rebranded active Project Management contract to RidgePath Forge. |
| `docs/operations-library-dependencies.md` | Rebranded active dependency review and updated template/runtime dependency statements. |

## Files Left Unchanged

| File or Pattern | Reason |
| --- | --- |
| Repository folder `ridgepath-forge` | Workspace path rename would be a separate compatibility-sensitive operation. |
| `launcher-settings.json` | Configuration file name is an internal compatibility surface used by the server. |
| `docs/launcher-workflow-contract.md` file name | File path is already referenced by docs and settings; content was rebranded instead. |
| `docs/launcher-handoff.md` generated artifact path | Operations Library templates and workflow outputs currently reference this compatibility path. |
| Template keys such as `launcherHandoff` | Internal configuration keys should not change without a coordinated template/settings migration. |
| Template paths containing `launcher-` | These live in the Operations Library contract and are compatibility paths. |
| Environment variables `LAUNCHER_API_PORT`, `LAUNCHER_CLIENT_PORT`, `LAUNCHER_REDIRECT_PORT`, `LAUNCHER_HOSTNAME` | Preserved to avoid breaking existing launch scripts and environment setups. |
| Hostnames `dev-launcher` and `devlauncher` | Preserved as legacy local hostnames to avoid hosts-file and URL churn. |
| Script filename `scripts/start-launcher.ps1` | Preserved because startup scripts and user habits may reference it. |
| Asset path `/assets/local-launcher-logo.png` | Preserved because renaming the asset path is not required for visible branding and could break references. |
| `window.__LOCAL_PROJECT_LAUNCHER_ROOT__` | Preserved as an internal React root reuse guard. |
| `docs/implementation/*` historical reports | Left unchanged as historical documentation and implementation evidence. |

## Branding Decisions

- Use `RidgePath Forge` anywhere the product presents itself to users.
- Use `Application Delivery Platform` as the primary tagline in browser metadata and documentation; the app header uses the horizontal RidgePath Forge logo lockup.
- Keep lowercase `launcher` where it describes a technical runtime role rather than the product brand.
- Keep compatibility names for settings, environment variables, hostnames, template paths, and generated artifact paths.
- Rebrand generated starter project text so new projects say they were registered by RidgePath Forge.
- Rebrand Project Management initialization prompts so Codex is instructed to verify the RidgePath Forge dashboard, not the legacy dashboard branding.

## Future Branding Opportunities

- Rename the repository folder and any external shortcuts after confirming no automation depends on `ridgepath-forge`.
- Rename `launcher-settings.json` to a RidgePath Forge settings filename with a migration/fallback reader.
- Add new Operations Library template aliases for RidgePath Forge handoff paths while retaining legacy template compatibility.
- Replace `/assets/local-launcher-logo.png` with a RidgePath Forge-branded image asset and update favicon artwork.
- Add a visible About modal with product name, tagline, Operations Library root, configured project root, and version.
- Introduce new local hostnames such as `ridgepath-forge` while retaining `dev-launcher` as a legacy alias.
