# Z-Library for BookOrbit

A dependency-free ebook indexer for BookOrbit plugin API v1. Search Z-Library by ISBN or title and author, then grab books in `epub`, `azw3`, `mobi`, or `pdf` format.

**Latest release:** [v0.1.4](https://github.com/thetoadsage/bookorbit-zlib-plugin/releases/tag/v0.1.4), with improved language filters and result language codes.

A Z-Library account is required. The plugin uses the unofficial EAPI, which may change. BookOrbit manages your configured credentials and download jobs; the plugin keeps sessions in process memory and does not log or write credentials or resolved download links to disk.

## Install

1. Download [`index.mjs` from v0.1.4](https://raw.githubusercontent.com/thetoadsage/bookorbit-zlib-plugin/v0.1.4/indexers/zlib/index.mjs). This is the only runtime file needed.
2. In BookOrbit, open **Settings > System > Requests > Sources**, select **Install plugin**, and upload the file.
3. Leave **Provider** set to `eapi` and **Base URL** set to `https://z-lib.gd`, unless your EAPI address differs.
4. Enter your **Z-Library email**. In BookOrbit's **API key** field, enter your **Z-Library password**.
5. Save the source and select **Test connection**.

Browser installs and verified updates activate without a restart. For a container-based copy, see [manual installation](#manual-installation).

## Settings and search behavior

| Setting | Default | Purpose |
| --- | --- | --- |
| Provider | `eapi` | Use `eapi` for Z-Library or `mock` for offline testing. |
| Base URL | `https://z-lib.gd` | HTTPS address of the EAPI service. |
| Z-Library email | Empty | Account email for EAPI authentication. |
| API key | Empty | Your Z-Library password. |
| Ebook formats | `epub,azw3,mobi,pdf` | Formats to request; select at least one. |
| Languages | Empty | Comma-separated language names or codes. Overrides the request's language when set. |

Search tries the ISBN first, then falls back to title and author if there are no usable results. Each search returns at most 50 results. Download links are resolved fresh at grab time, and file sizes are included when the provider supplies them.

Language filters accept English names and ISO codes, including regional or script tags: `Portuguese`, `pt`, `por`, `pt-BR`, and `zh-Hans`. Tags use the base language for EAPI filtering; unrecognized filters pass through for custom provider names. Recognized result languages use ISO 639-1 codes. Unknown names and languages without a two-letter equivalent leave the language field unset.

## Updates

Existing signed installations can update through BookOrbit. Automatic updates are optional. BookOrbit checks the public manifest at [`updates/zlib.json`](updates/zlib.json), offers newer versions, and verifies the downloaded runtime's SHA-256 checksum and Ed25519 signature before installing it.

The update channel serves the runtime and manifest from this repository's `main` branch over HTTPS; GitHub authentication is not required. Installations of `0.1.0` without update metadata need a manual reinstall of the signed runtime before they can check for updates.

See the [release notes](https://github.com/thetoadsage/bookorbit-zlib-plugin/releases) for version history.

## Compatibility and validation

The plugin uses **BookOrbit plugin API v1**. Contract and loader compatibility were reviewed against [BookOrbit v3.3.0](https://github.com/bookorbit/bookorbit/releases/tag/v3.3.0) on October 11, 2026, including its shape validator, host adapter, signed updater, and direct-download contract.

For v0.1.4, the maintainer confirmed successful BookOrbit updater installation, Test connection, search, and grab/import before release. Offline regression checks separately cover language mapping, ISBN fallback, concurrent login handling, session renewal, and error classification. The signed runtime's checksum and signature also pass repository verification.

## Manual installation

Place the runtime at `/data/plugins/indexers/zlib/index.mjs` inside the BookOrbit container. Identify the host directory mounted at `/data` and the application container name, then set `BOOKORBIT_DATA_DIR` and `BOOKORBIT_CONTAINER` and run from this repository:

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

A manual copy does not validate BookOrbit's signed updater path.

## Development

The runtime is [`indexers/zlib/index.mjs`](indexers/zlib/index.mjs); the root `index.mjs` is a compatibility symlink. Fixtures and validation scripts are development tools and are not needed for installation.

Run all required checks before proposing a merge or release:

```sh
node verify.mjs
node --check indexers/zlib/index.mjs
node --check live-validate.mjs
node scripts/verify-update.mjs
git diff --check
```

[`live-validate.mjs`](live-validate.mjs) is a developer-only provider probe. It reads `BOOKORBIT_ZLIB_BASE_URL`, `BOOKORBIT_ZLIB_EMAIL`, and `BOOKORBIT_ZLIB_PASSWORD` from the environment and prints redacted response structure. `--resolve-probe` checks the link response without downloading file bytes. See [`LIVE_SHAPE.md`](LIVE_SHAPE.md) for response-shape notes. Keep credentials, session values, personalized links, and raw live responses out of logs and commits.

### Signing and releases

Follow the staged [development and release workflow](AGENTS.md). Documentation-only changes need no version bump or regenerated manifest. Runtime changes require a newly signed manifest, and new releases require real BookOrbit updater validation before tagging.

Keep the Ed25519 private key **outside this repository**. Use the existing signing key and preserve the embedded public key and update URLs unless a rotation or hosting migration is explicitly authorized. After preparing a new version on a release branch, sign it with:

```sh
BOOKORBIT_PLUGIN_SIGNING_KEY=/secure/location/bookorbit-zlib-ed25519.pem \
BOOKORBIT_PLUGIN_PUBLIC_KEY=/secure/location/bookorbit-zlib-ed25519.pub.pem \
BOOKORBIT_PLUGIN_UPDATE_ROOT=https://raw.githubusercontent.com/thetoadsage/bookorbit-zlib-plugin/main \
node scripts/sign-update.mjs zlib
```

The optional public-key path checks that it matches the private key. The script embeds the update channel, hashes and signs the exact runtime bytes, and writes `updates/zlib.json`. Run all checks above afterward and publish the runtime and manifest together through the release workflow. Never move an existing release tag or amend a published release commit.
