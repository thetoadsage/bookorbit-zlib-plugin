# Repository development and release workflow

These rules apply to all work in this repository. Read this file before making changes.

## Development workflow

- Keep `main` stable. Never do feature or fix work directly on `main`.
- Create a descriptive branch first: `feature/<name>`, `fix/<name>`, or `release/<version>`.
- Never force-push `main`.
- Never rewrite or move an existing release tag.
- Never amend an already-published release commit.

## Before changing code

- Read `AGENTS.md`.
- Inspect `git status` and the current branch.
- Confirm the working tree is clean before starting unrelated work. Preserve any existing changes.
- Preserve BookOrbit plugin API v1 compatibility unless the task explicitly requires changing it.
- Do not make unrelated refactors during a feature or fix.

## Required verification

Before proposing any merge or release, run:

```sh
node verify.mjs
node --check indexers/zlib/index.mjs
node --check live-validate.mjs
node scripts/verify-update.mjs
git diff --check
```

If a check fails, stop and diagnose that failure. Do not commit, tag, or release until it is fixed.

## Security requirements

Never commit or expose Z-Library email or password, `remix-userid`, `remix-userkey`, cookies, personalized or signed download URLs, `.env` files, private signing keys, or raw live API responses containing sensitive values.

Keep the Ed25519 private signing key outside this repository. Do not change the embedded public key unless explicitly instructed to rotate the signing key.

## Normal feature and fix workflow

1. Create a feature or fix branch from current `main`.
2. Make the smallest scoped change.
3. Add or update tests.
4. Run all required verification.
5. Review `git diff` and `git diff --check`.
6. Commit with a descriptive conventional commit message.
7. Push the branch and open a PR against `main`.
8. Stop before merging unless explicitly instructed.

## Release workflow

For every new plugin version:

1. Start from updated `main` and create `release/vX.Y.Z`.
2. Change the plugin version only as needed for the release.
3. Regenerate and sign `updates/zlib.json` using the existing signing workflow and an external Ed25519 private key.
4. Verify that the manifest version matches the plugin version; its SHA-256 matches the exact bytes of `indexers/zlib/index.mjs`; and its Ed25519 signature verifies.
5. Confirm `sourceUrl` and the embedded update manifest URL are unchanged unless deliberately migrating hosting. Confirm the embedded public key is unchanged unless deliberately rotating keys.
6. Run all required tests and checks.
7. Commit with `release: prepare vX.Y.Z`.
8. Push the release branch and open a PR against `main`.
9. Stop before merging unless explicitly instructed.

## After a release PR merges

Do not immediately create a tag or GitHub Release. First validate the release through BookOrbit's real updater:

```text
installed previous version
-> BookOrbit discovers new manifest
-> downloads source
-> SHA-256 verification passes
-> Ed25519 verification passes
-> update installs
-> new plugin version loads
-> plugin Test action passes
-> normal search works
-> known-good grab/import succeeds when appropriate
```

Do not manually replace `index.mjs` during updater validation. If validation fails, do not tag or create a GitHub Release. Identify the exact failing stage and fix it through a new commit and PR as appropriate.

## Finalizing a validated release

Only after updater validation succeeds:

1. Confirm `main` is clean and current.
2. Re-run all required verification.
3. Create and push the annotated tag `vX.Y.Z`.
4. Create the matching GitHub Release.
5. Never move or recreate the tag afterward.

## Existing stable release

`v0.1.1` is the first fully validated signed-update release and a known-good rollback point.

## General Codex behavior

- Do not deploy, merge, tag, publish releases, or change repository visibility unless explicitly instructed.
- Do not silently bump versions or regenerate manifests unnecessarily.
- Do not perform multiple release stages in one step unless explicitly asked.
- At each release stage, report what changed, what was verified, and what remains intentionally undone.
