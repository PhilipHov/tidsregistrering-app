// scripts/build-server.mjs
import { build } from 'esbuild';

await build({
  entryPoints: ['server/index.ts'],
  platform: 'node',
  bundle: true,
  format: 'esm',
  outdir: 'dist',
  packages: 'external',
});
console.log('Server bundle built to dist/');

