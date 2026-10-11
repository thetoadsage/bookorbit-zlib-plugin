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
- Initial documentation-only work was on `fix/readme-release-status`, based on origin/main at `d496936`, with PR #5 opened before the user requested a combined local review.
- Synthetic offline reproductions found three candidates for a later signed runtime fix: five concurrent cold searches issue five logins; HTTP 200 file responses with `success: 0` and a session-expiry error bypass renewal; `post()` converts host timeout failures to `unreachable`.
- These candidates were initially documented without runtime changes; implementation follows below.

## Combined local v0.1.3 candidate — 2026-10-11

- User initially authorized all three fixes with the README together, explicitly requested no new PR, and reserved push/merge until after review. Subsequent publication authorization is recorded below.
- Local review branch: `release/v0.1.3`, from origin/main at `d496936`. README and project memory changes were carried over; combined work remained uncommitted for user review.
- Login cache shares pending authentication per source and matching credential, drops failed attempts, and prevents older in-flight credential attempts from replacing or evicting a newer session. Test refreshes completed sessions but joins an existing pending login.
- Session invalidation compares the rejected session's identity before eviction. HTTP 200 body-level file expiry now enters the same bounded renewal path as HTTP 401/403; quotas remain non-retryable.
- Host-classified fetch failures are preserved; native TimeoutError/AbortError become generic timeout failures in both POST and file requests. Unknown network errors remain redacted.
- Regression checks cover concurrent search/Test/resolve, shared login failure recovery, credential changes during successful/failed older logins, delayed expiry after renewal, bounded body-level expiry retries, non-retryable quotas, and tagged/native timeout errors at all three request stages.
- Runtime version is intentionally advanced to 0.1.3 because changed source bytes require a new signed update. Use the existing external signing key; preserve the embedded public key and both public update URLs. The implementation request alone did not authorize deployment or live provider activity; the subsequent deployment authorization is recorded below.
- Local manifest regenerated using the existing external key after confirming its public key matches. All five required checks pass for the final runtime bytes. Actual BookOrbit v3.3.0 shape validation and offline mock Test/search/resolve pass again; source URL, manifest URL, and embedded public key are verified unchanged.
- At the local-review stage, user review, commit/push/merge authorization, and real updater/Test/search/grab validation were pending. Subsequent functional-test confirmation and publication authorization are recorded below. Existing documentation-only PR #5 was not updated by the local implementation work.

## Toadstool test deployment — 2026-10-11

- User explicitly authorized deploying the local v0.1.3 candidate before pushing so they could test. At deployment, GitHub was unchanged and the combined work was uncommitted on `release/v0.1.3`.
- Confirmed the existing installed plugin was v0.1.2 with the exact published checksum. Reverified the candidate manifest's SHA-256 and Ed25519 signature on the server using the unchanged embedded public key before installation.
- Atomically replaced only `/data/plugins/indexers/zlib/index.mjs` in `bookorbit-app`, preserving owner 1000:1000 and mode 0600. Persistent host path: `/opt/docker/data/bookorbit/app/plugins/indexers/zlib/index.mjs`.
- Rollback file: `/opt/docker/data/bookorbit/app/plugin-backups/zlib/pre-v0.1.3-20261011T231201Z/index.mjs` (container path `/data/plugin-backups/zlib/pre-v0.1.3-20261011T231201Z/index.mjs`). A sibling `deployment.json` records old/new checksums. Restore the file with owner/mode preserved and restart only `bookorbit-app` if rollback is requested.
- Restarted only `bookorbit-app`. It became healthy, `/api/v1/health` returned HTTP 200, the application loader reported `loaded=1 failed=0`, and the installed plugin reports v0.1.3 with SHA-256 `75dea48adb637a2b66f8d44b85fa471ffc363a70fd84623113fd6f40eb3d2b7c`.
- `bookorbit-db` retained the same container ID and start time and stayed healthy. Temporary host/container staging was removed; the rollback copy remains.
- No connection Test, provider searches, or downloads were initiated by this deployment. User will perform functional testing. This direct pre-push installation does not validate BookOrbit's signed updater; preserve the v0.1.2 rollback copy for the later updater-validation stage before tagging/releasing.

## v0.1.3 publication authorization — 2026-10-11

- User explicitly requested push, merge to main, and release of v0.1.3. They confirmed Test connection, normal search, and grab/import passed on the direct installation and explicitly waived the real-updater validation gate for v0.1.3 only.
- Publish the combined code, regression tests, signed manifest, README, and project memory without a new PR, as requested. Keep the embedded public key and public update URLs unchanged; never rewrite existing tags or published commits.
- README and release notes must distinguish operator-confirmed functional testing from the unexercised signed-updater install path. This release-specific waiver does not change AGENTS.md's default gate for future versions.
