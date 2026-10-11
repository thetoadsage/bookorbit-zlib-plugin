# Project memory

## Scope and workflow

- Dependency-free Z-Library ebook indexer for BookOrbit plugin API v1.
- Runtime: `indexers/zlib/index.mjs`; signed update: `updates/zlib.json`.
- Read `AGENTS.md` before changes. Use feature/fix/release branches; preserve main and existing tags. Follow the staged release workflow.
- Keep credentials, session values, personalized links, raw live responses, and private signing keys out of this repository and logs.
- Required checks: `node verify.mjs`, `node --check indexers/zlib/index.mjs`, `node --check live-validate.mjs`, `node scripts/verify-update.mjs`, `git diff --check`.

## Compatibility review — 2026-10-11

- Local plugin version: 0.1.2. Public main serves identical runtime and manifest bytes as this checkout.
- Latest upstream release at review time: BookOrbit v3.3.0, published 2026-10-07. Source: https://github.com/bookorbit/bookorbit/releases/tag/v3.3.0.
- Reviewed the tagged API contract, loader/shape validation, host adapter, candidate normalization, signed updater, and direct downloader. API remains v1; no compatibility break identified.
- Executed the actual v3.3.0 shape validator in isolation after stripping TypeScript and supplying the upstream media-kind constant. It accepts this plugin and rejects deliberately incompatible controls.
- Offline mock Test/search/resolve also pass with upstream v3.3.0's search-text helper. All five required repository checks pass; SHA-256 and Ed25519 verification pass.
- Limits: no authenticated provider calls, real downloads/imports, deployed-version inspection, or in-app updater validation performed in this review. Compatibility findings do not establish live service health.
- No runtime, version, manifest, or signing-key change was needed.

## Documentation and optimization review — 2026-10-11

- GitHub release readback confirms v0.1.2 was published 2026-09-25. README now links the release, records the scoped v3.3.0 compatibility review, explains settings/search behavior and credential ownership, and lists all required checks. Manual install examples require explicit container/data-directory variables.
- Documentation-only work is on `fix/readme-release-status`, based on origin/main at `d496936`; preserve staged PR/merge separation.
- Synthetic offline reproductions found three candidates for a later signed runtime fix: five concurrent cold searches issue five logins; HTTP 200 file responses with `success: 0` and a session-expiry error bypass renewal; `post()` converts host timeout failures to `unreachable`.
- Prefer sharing an in-flight login per configuration/credential to reduce duplicate requests. Add focused concurrency, body-level expiry, and error-classification tests when implementing runtime changes. No runtime optimization was applied in this documentation change.
