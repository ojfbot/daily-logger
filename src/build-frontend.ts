import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/frontend/app.ts'],
  outfile: 'assets/js/app.js',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: false,
  sourcemap: false,
  logLevel: 'info',
})
