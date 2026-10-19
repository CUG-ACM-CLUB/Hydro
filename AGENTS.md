# Platform Integration

- Keep upstream Hydro behavior intact; place learning-specific integration in `plugins/acm-platform`.
- Use `feature/*`, `fix/*`, `release/*`, `hotfix/*`, `develop` or the existing upstream `master` branch. No `codex/*` branches.
- All builds, formatting, tests and UI checks run in Docker on `zelong_sun_231`, not on macOS.
- Transfer committed changes using Git bundles; preserve uncommitted server changes.
- Build the checked-out source, not a separately downloaded Hydro npm release.
- Do not read, modify or delete Gitea, daed, unrelated services or their data.
- Never commit real credentials, database dumps or generated runtime configuration.
- Internal integration endpoints require the shared secret and recheck the Hydro user's permissions.
