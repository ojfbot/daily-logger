# Rerun the local October browser proof

The verification uses the repository's installed Playwright package and a dedicated local app server. It does not install dependencies or call a provider.

1. Prepare an evidence directory with the actual production API outputs in `before-build/` and `after-build/`. Each directory must contain `entries.json` and its `articles/` JSON files. The repository must contain the corresponding article bytes and `docs/time-backfill/2026-10/manifest.json`.
2. Use the dedicated local server on port 4058. If that server is not running, start it from the repository root in a separate terminal:

```sh
VITE_BASE_PATH=/ pnpm --dir packages/frontend dev --host 127.0.0.1 --port 4058 --strictPort
```

3. Run the portable script from the repository root. Supply all three directory arguments. Use a fresh output directory to preserve an earlier run:

```sh
pnpm exec node /path/to/browser/verify-october.mjs \
  --repo="$PWD" \
  --evidence=/path/to/frozen-before-after \
  --out=/path/to/fresh-browser-evidence \
  --base-url=http://127.0.0.1:4058
```

The default browser channel is `chrome`. `--channel=chrome` sets that channel explicitly. The script rejects a nonlocal app hostname and intercepts every API request. It serves the frozen local API files, returns local 503 fixtures for unavailable APIs, and blocks nonlocal HTTP requests.

A passing run prints `status: passed`, 16 dates, 22 before bindings, 25 after bindings, 22 preserved bindings, three real popover cases, three synthetic controls, and zero page errors. It writes `inventory.json` and `screenshots/` in the output directory. Redirect standard output and standard error to `run.log` to retain the console result.

`verify-october.executed.mjs` archives the exact script used for this recorded proof. `verify-october.mjs` has the same browser assertions with portable directory arguments. `script-versions.json` records both SHA-256 values. The recorded browser assertions were not rerun solely for the argument-packaging change.

`public-verification.md` and `rendered-per-date.json` summarize this recorded run. They exclude verbose network lists and local absolute paths. The full local inventory retains those details.
