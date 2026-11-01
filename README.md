# Z-Library for BookOrbit

Search Z-Library by ISBN, title, and author, then download ebooks in **EPUB, AZW3, MOBI, or PDF** format.

**Latest release:** [v0.1.5](https://github.com/thetoadsage/bookorbit-zlib-plugin/releases/tag/v0.1.5) · [Release history](https://github.com/thetoadsage/bookorbit-zlib-plugin/releases)

Requires a Z-Library account. The plugin uses the unofficial EAPI, which may change. BookOrbit manages credentials and downloads; the plugin keeps sessions in memory and does not log credentials or resolved download links.

## Installation

1. Download [`index.mjs` from v0.1.5](https://raw.githubusercontent.com/thetoadsage/bookorbit-zlib-plugin/v0.1.5/indexers/zlib/index.mjs). This is the only file needed.
2. Open **Sources** in BookOrbit's request settings, select **Install plugin**, and upload the file.
3. Leave **Provider** set to `eapi` and **Base URL** set to `https://z-lib.gd`, unless your EAPI address differs.
4. Enter your **Z-Library email** and put your **Z-Library password** in BookOrbit's **API key** field.
5. Save the source and select **Test connection**.

Browser installation and signed updates activate without a restart.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| Provider | `eapi` | Use `mock` for offline testing. |
| Base URL | `https://z-lib.gd` | HTTPS address of the EAPI service. |
| ISBN-first search | Off | Skip title/author searching when the ISBN returns usable results. |
| Ebook formats | `epub,azw3,mobi,pdf` | Formats to search for; select at least one. |
| Languages | Empty | Language names or codes. Overrides the request's language when set. |

The **Languages** setting accepts names and ISO codes such as `Portuguese`, `pt`, `por`, `pt-BR`, or `zh-Hans`. Regional and script tags use the base language. Unrecognized filter values pass through to the provider; unrecognized result languages remain unstated.

## How search works

By default, the plugin searches **ISBN and title/author together**. This can find other editions or formats that an ISBN-only search misses. Duplicate records are combined, and both searches contribute candidates to a list of up to 50 results. BookOrbit handles the final match scoring and ranking.

- Enable **ISBN-first search** to search by ISBN first and use title/author only when no usable ISBN results are found.
- Disable BookOrbit's **Search by ISBN** for this source to search by title/author only.
- BookOrbit may still display **“searched the ISBN”** when the plugin searched both ways. That label describes the query passed to the plugin.

Combined mode uses up to two provider search requests. If one fails before BookOrbit's overall deadline, results from the other are retained with a generic log warning. A failure with no results remains an error.

File sizes are included when available. Download links are resolved fresh when you grab a release.

## Updates and compatibility

Use **Check for updates** in BookOrbit's request settings. Automatic signed updates are optional. BookOrbit verifies the downloaded file's **SHA-256 checksum and Ed25519 signature** before installing it.

The [update manifest](updates/zlib.json) and runtime are served from this repository's `main` branch; no GitHub login is required. Version `0.1.0` installations without update metadata need a manual reinstall before they can check for updates.

The plugin uses **BookOrbit plugin API v1**. Version 0.1.5 was validated with BookOrbit v3.6.0 through its signed updater, connection Test, release search, and EPUB file inspection. See the [release notes](https://github.com/thetoadsage/bookorbit-zlib-plugin/releases/tag/v0.1.5) for validation details.

<details>
<summary>Manual container installation</summary>

Place the runtime at `/data/plugins/indexers/zlib/index.mjs` inside the BookOrbit container. Set the host directory mounted at `/data` and the application container name, then run from this repository:

```sh
: "${BOOKORBIT_DATA_DIR:?Set the host directory mounted at /data}"
: "${BOOKORBIT_CONTAINER:?Set the BookOrbit application container name}"
mkdir -p "$BOOKORBIT_DATA_DIR/plugins/indexers/zlib"
if [ -f "$BOOKORBIT_DATA_DIR/plugins/indexers/zlib/index.mjs" ]; then
  cp -p "$BOOKORBIT_DATA_DIR/plugins/indexers/zlib/index.mjs" "$BOOKORBIT_DATA_DIR/plugins/indexers/zlib/index.mjs.bak"
fi
cp indexers/zlib/index.mjs "$BOOKORBIT_DATA_DIR/plugins/indexers/zlib/index.mjs"
docker restart "$BOOKORBIT_CONTAINER"
```

A manual copy does not validate BookOrbit's signed updater path.

</details>

## Development

The plugin is dependency-free. Its runtime is [`indexers/zlib/index.mjs`](indexers/zlib/index.mjs); the root `index.mjs` is a compatibility symlink. Fixtures and validation scripts are not needed for installation.

Follow [AGENTS.md](AGENTS.md) for the development and release workflow. Run all required checks before proposing a merge or release:

```sh
node verify.mjs
node --check indexers/zlib/index.mjs
node --check live-validate.mjs
node scripts/verify-update.mjs
git diff --check
```

[`live-validate.mjs`](live-validate.mjs) is a developer-only probe that prints redacted response structure. It reads `BOOKORBIT_ZLIB_BASE_URL`, `BOOKORBIT_ZLIB_EMAIL`, and `BOOKORBIT_ZLIB_PASSWORD` from the environment. `--resolve-probe` checks file resolution without downloading the book. See [LIVE_SHAPE.md](LIVE_SHAPE.md) for response-shape notes. Keep credentials, session values, personalized links, and raw responses out of logs and commits.

<details>
<summary>Signing an update</summary>

Documentation-only changes need no version bump or new manifest. Runtime releases need a new version and signed manifest, followed by real BookOrbit updater validation before tagging.

Keep the private key outside this repository. Use the existing signing key and preserve the public key and update URLs unless a rotation or migration is explicitly authorized:

```sh
BOOKORBIT_PLUGIN_SIGNING_KEY=/secure/location/bookorbit-zlib-ed25519.pem \
BOOKORBIT_PLUGIN_PUBLIC_KEY=/secure/location/bookorbit-zlib-ed25519.pub.pem \
BOOKORBIT_PLUGIN_UPDATE_ROOT=https://raw.githubusercontent.com/thetoadsage/bookorbit-zlib-plugin/main \
node scripts/sign-update.mjs zlib
```

The optional public-key path checks that it matches the private key. The script embeds the update channel, signs the exact runtime bytes, and writes their checksum and signature to `updates/zlib.json`. Run all required checks afterward. Never move existing release tags or amend published release commits.

</details>
