import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

// Compile only the two isolated entry points; dependencies remain pinned external
// packages. No runtime compiler/helper subprocess is needed by the exporter.
await build({
  absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
  entryPoints: ['src/telemetry-export-child.ts', 'src/telemetry-export-worker.ts'],
  outdir: 'dist/telemetry', outExtension: { '.js': '.mjs' },
  bundle: true, packages: 'external', platform: 'node', format: 'esm', target: 'node24',
  sourcemap: false, legalComments: 'none',
})
