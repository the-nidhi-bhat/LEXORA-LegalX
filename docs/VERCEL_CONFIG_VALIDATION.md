# Vercel Services configuration validation

Validated 2026-11-22 against:
- Public JSON schema: `https://openapi.vercel.sh/vercel.json`
- Official docs: `/vercel.com/docs/services`, `/vercel.com/docs/services/routing`, `/vercel.com/docs/project-configuration/vercel-toml`, `/vercel.com/docs/functions/runtimes/python`, `/vercel.com/docs/services/bindings`

## Current `vercel.json` (unchanged — validated, no fix required)

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "services": {
    "app": {
      "root": ".",
      "framework": "vite",
      "installCommand": "npm install",
      "buildCommand": "npm run build",
      "outputDirectory": "dist",
      "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
    },
    "api": {
      "root": ".",
      "framework": "fastapi",
      "entrypoint": "api.app.main:app",
      "installCommand": "pip install -r api/requirements.txt"
    }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": { "service": "api" } },
    { "source": "/(.*)", "destination": { "service": "app" } }
  ]
}
```

## Findings

| Requirement | Status | Evidence |
|---|---|---|
| Top-level `services` key is valid | PASS | Public schema + official docs use exactly this key (older `experimentalServicesV2` was a CLI-internal fixture, not the public contract) |
| Service names `app` / `api` | PASS | Both match `^[a-z]([a-z_-]*[a-z])?$`; owner directive names satisfied |
| Rewrite destination `{ "service": "name" }` | PASS | `type` field optional in current docs; `service` field is required and present |
| API paths preserved (`/api/(.*)` → `api`) | PASS | First rewrite routes API before the catch-all |
| SPA deep links (`/(.*)` → `/index.html` inside `app`) | PASS | Service-level rewrite present |
| FastAPI dependency install | PASS | `installCommand: pip install -r api/requirements.txt`; official Python runtime uses requirements.txt |
| ASGI entry point resolves | PASS | `entrypoint: api.app.main:app`; `api/app/main.py` defines `app = create_app()`; official runtime requires top-level `app` name — satisfied |
| No unsupported top-level build keys | PASS | No top-level `buildCommand`/`outputDirectory`/`framework`/`functions`; all such keys are inside services |
| Internal bindings only if server-to-server calls exist | PASS | No `bindings` declared; frontend calls backend via public `/api` routes (same origin), no binding needed |
| Backend `root` value | DEVIATION (documented) | Kept `.` not `api`: `api/app/main.py` uses ~140 absolute `from api.app...` imports; setting root `api` would break every import. Service is still named `api` per owner directive. Verified by source inspection. |

## Operational validation status

- `vercel pull --environment preview` — exit 0 (project linked: `lexora-legalx`, projectId `prj_s7ofWrePH1qlRrJpnFjCj6Tp7WBn`).
- `vercel build --environment preview` — CLI recognized BOTH services (`app` vite, `api` FastAPI) and ran `npm install` for `app` (0 vulnerabilities). It then failed with `spawn cmd.exe ENOENT` in the local build-command phase — a Windows Vercel-CLI defect (reproduced via a short-path junction, so not a path-length issue), **not** a config error. Local build cannot fully validate on Windows.
- Operational validity will be confirmed by the real cloud preview deployment (`vercel deploy --prebuilt` is not usable given the local build defect; a source deploy via `vercel deploy` or Git integration is required).

Conclusion: `vercel.json` requires NO change. It is structurally valid and matches official Services guidance. Cloud preview build remains the authoritative operational check.
