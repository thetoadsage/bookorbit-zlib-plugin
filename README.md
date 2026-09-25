# Z-Library BookOrbit indexer

Version **0.1.0**. A dependency-free BookOrbit `PLUGIN_API_VERSION` 1 indexer for ebooks (`epub`, `azw3`, `mobi`, `pdf`). It searches by ISBN or title and author, then resolves a fresh EAPI file link when BookOrbit grabs a release. The default `mock` provider uses offline sample data; select `eapi` for live use. The EAPI is unofficial and may change.

Live use requires a configurable HTTPS EAPI base URL, an account email, and a password in BookOrbit's credential field. Formats and languages are configurable. Authentication values stay in process memory. The plugin does not log credentials, session values, or resolved links, and it does not cache download URLs.

## Manual installation

The path **inside** the container is `/data/plugins/indexers/zlib/index.mjs`. Find the host directory mounted at `/data` with `docker inspect` before copying; it varies by deployment. With `BOOKORBIT_DATA_DIR` set to that host directory and `BOOKORBIT_CONTAINER` set to the confirmed application container name:

```sh
mkdir -p "$BOOKORBIT_DATA_DIR/plugins/indexers/zlib"
if [ -f "$BOOKORBIT_DATA_DIR/plugins/indexers/zlib/index.mjs" ]; then
  cp -p "$BOOKORBIT_DATA_DIR/plugins/indexers/zlib/index.mjs" "$BOOKORBIT_DATA_DIR/plugins/indexers/zlib/index.mjs.bak"
fi
cp index.mjs "$BOOKORBIT_DATA_DIR/plugins/indexers/zlib/index.mjs"
docker restart "$BOOKORBIT_CONTAINER"
docker logs --since 2m "$BOOKORBIT_CONTAINER" 2>&1 | grep -E 'plugin_load|zlib|error'
```

The commands back up an existing `zlib` file before copying and restart only the BookOrbit application container. Verify BookOrbit loads the plugin, run its Test action, perform a search, and try one grab/import. If an older `zlib-test` installation exists, remove it separately after confirming the new plugin works; BookOrbit may otherwise show both entries. Configure the new `zlib` indexer in BookOrbit rather than assuming settings from `zlib-test` migrate automatically.

## Development

```sh
node verify.mjs
node --check index.mjs
node --check live-validate.mjs
```

`live-validate.mjs` is **developer-only**. It uses `BOOKORBIT_ZLIB_BASE_URL`, `BOOKORBIT_ZLIB_EMAIL`, and `BOOKORBIT_ZLIB_PASSWORD` environment variables; `--resolve-probe` checks response structure without downloading file bytes. Its output contains shapes and status only. Do not save raw API responses or credentials. The fixtures contain synthetic values.
