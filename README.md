# Z-Library BookOrbit indexer

`zlib` is a dependency-free BookOrbit plugin API v1 indexer for ebooks (`epub`, `azw3`, `mobi`, `pdf`). It searches by ISBN or title and author, then resolves a fresh EAPI download link at grab time. The current release is [**v0.1.2**](https://github.com/thetoadsage/bookorbit-zlib-plugin/releases/tag/v0.1.2). The EAPI is unofficial and may change.

Live use needs a Z-Library account. The plugin keeps sessions in process memory and does not log credentials or resolved links, or write them to disk. BookOrbit manages the configured credentials and download jobs.

## Compatibility

Reviewed against [BookOrbit v3.3.0](https://github.com/bookorbit/bookorbit/releases/tag/v3.3.0) on **2026-10-11**. Its [plugin contract](https://github.com/bookorbit/bookorbit/blob/v3.3.0/packages/plugin-api/src/index.ts) remains API v1; no compatibility break was identified in the loader, host adapter, signed updater, or direct-download contract.

The plugin passes v3.3.0's shape validator, offline mock Test/search/file resolution with its search-text helper, and all repository verification checks, including SHA-256 and Ed25519 signature verification. This review did not exercise an installed BookOrbit instance, authenticated Z-Library requests, or real downloads/imports.

## Install

1. In BookOrbit, open **Settings > System > Requests > Sources** and select **Install plugin**.
2. Upload [`indexers/zlib/index.mjs`](indexers/zlib/index.mjs). This is the only runtime file needed.
3. In the source setup form, leave **Provider** at its default (`eapi`). The **Base URL** defaults to `https://z-lib.gd`; change it only if your EAPI address differs.
4. Enter your **Z-Library email**. In BookOrbit's **API key** field, enter your **Z-Library password**.
5. Save the source and use **Test connection**.

The `mock` provider remains available for offline testing. The embedded update channel lets BookOrbit check signed updates; automatic updates are optional. Browser installs and verified updates activate without a restart.

### Source settings

| Setting | Default | Purpose |
| --- | --- | --- |
| Provider | `eapi` | Use `eapi` for Z-Library or `mock` for the offline fixture. |
| Z-Library email | Empty | Account email for EAPI authentication. |
| API key | Empty | Z-Library password, entered in BookOrbit's shared credential field. |
| Ebook formats | `epub,azw3,mobi,pdf` | Formats to request; select at least one. |
| Languages | Empty | Comma-separated language names or codes. If empty, use the request's language when present. |

Search tries the request's ISBN first and falls back to title and author when it finds no usable results. Each search returns at most 50 results. File links are resolved when a release is grabbed, so a link from an earlier search is not reused.

### Manual installation

For a manual copy, place the file at `/data/plugins/indexers/zlib/index.mjs` inside the container. The host directory mounted at `/data` varies. After finding that mount and confirming the application container name, set `BOOKORBIT_DATA_DIR` and `BOOKORBIT_CONTAINER`, then run from this repository:

```sh
: "${BOOKORBIT_DATA_DIR:?Set the host directory mounted at /data}"
: "${BOOKORBIT_CONTAINER:?Set the BookOrbit application container name}"
mkdir -p "$BOOKORBIT_DATA_DIR/plugins/indexers/zlib"
if [ -f "$BOOKORBIT_DATA_DIR/plugins/indexers/zlib/index.mjs" ]; then
  cp -p "$BOOKORBIT_DATA_DIR/plugins/indexers/zlib/index.mjs" "$BOOKORBIT_DATA_DIR/plugins/indexers/zlib/index.mjs.bak"
fi
cp indexers/zlib/index.mjs "$BOOKORBIT_DATA_DIR/plugins/indexers/zlib/index.mjs"
docker restart "$BOOKORBIT_CONTAINER"
docker logs --since 2m "$BOOKORBIT_CONTAINER" 2>&1 | grep -E 'plugin_load|zlib|error'
```

## Signed updates

This repository follows BookOrbit's extra-plugin format: runtime source at `indexers/zlib/index.mjs` and a signed manifest at `updates/zlib.json`. The runtime file embeds the HTTPS manifest URL and a base64url Ed25519 public key. The manifest contains `schemaVersion`, `type`, `version`, `sourceUrl`, the SHA-256 of the exact runtime bytes, and a base64 Ed25519 signature of those bytes. There is no separate repository catalog file in the reference format.

BookOrbit fetches the manifest and source without GitHub authentication. They must be publicly reachable by HTTPS. The embedded raw GitHub URLs serve them from `main`. BookOrbit compares semantic versions; an equal version with the same SHA-256 is current, while a newer version is offered for update. It verifies the downloaded source against both the checksum and the embedded public key before installation. A local `0.1.0` installation without update metadata needs a manual reinstall of the signed runtime file before it can check updates.

Maintainers must follow the staged [development and release workflow](AGENTS.md). A README-only change needs no plugin version bump or regenerated manifest. Any runtime change must be signed before publication, and a new release requires BookOrbit updater validation before tagging.

The private signing key belongs **outside this repository**. Generate your own Ed25519 pair if needed, for example with `openssl genpkey -algorithm Ed25519 -out /secure/location/bookorbit-zlib-ed25519.pem` and `openssl pkey -in /secure/location/bookorbit-zlib-ed25519.pem -pubout -out /secure/location/bookorbit-zlib-ed25519.pub.pem`. Restrict private-key permissions. The public PEM may also stay outside the repo; the signing script derives its raw public key and embeds it in the runtime file. `*.pem` and `*.key` are gitignored as a backstop.

To prepare a later version such as `0.1.3`, bump `VERSION` in `indexers/zlib/index.mjs`, then sign and verify:

```sh
BOOKORBIT_PLUGIN_SIGNING_KEY=/secure/location/bookorbit-zlib-ed25519.pem \
BOOKORBIT_PLUGIN_PUBLIC_KEY=/secure/location/bookorbit-zlib-ed25519.pub.pem \
BOOKORBIT_PLUGIN_UPDATE_ROOT=https://raw.githubusercontent.com/thetoadsage/bookorbit-zlib-plugin/main \
node scripts/sign-update.mjs zlib
node scripts/verify-update.mjs
node verify.mjs
```

The optional public-key path checks that it matches the private key. The signing script updates the embedded public key and URL, hashes the resulting exact `index.mjs` bytes with SHA-256, and signs those same bytes. Publish the runtime file and manifest together. Keep the private key and any live API responses out of commits. Do not change or reuse an existing release tag.

## Development

`verify.mjs`, `live-validate.mjs`, `fixtures/`, and `LIVE_SHAPE.md` are development files. The root `index.mjs` is a compatibility symlink to the runtime file so the original local checks still work.

```sh
node verify.mjs
node --check indexers/zlib/index.mjs
node --check live-validate.mjs
node scripts/verify-update.mjs
git diff --check
```

`live-validate.mjs` is developer-only. It reads `BOOKORBIT_ZLIB_BASE_URL`, `BOOKORBIT_ZLIB_EMAIL`, and `BOOKORBIT_ZLIB_PASSWORD` from the environment, and prints redacted response structure. `--resolve-probe` checks the link response without downloading file bytes. Do not save credentials, session values, signed links, or raw live responses.
