import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Building Electron main process...');
// Build main process
build({
  entryPoints: [join(__dirname, 'main.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: join(__dirname, '../dist-electron/main.js'),
  external: ['electron'],
})
  .then(() => {
    console.log('✓ Main process built successfully');
  })
  .catch((error) => {
    console.error('✗ Failed to build main process:', error);
    process.exit(1);
  });

console.log('Building Electron preload script...');
// Build preload script (must be CommonJS for Electron)
build({
  entryPoints: [join(__dirname, 'preload.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs', // CommonJS format required for Electron preload scripts
  outfile: join(__dirname, '../dist-electron/preload.js'),
  external: ['electron'],
})
  .then(() => {
    console.log('✓ Preload script built successfully');
    console.log('✓ Electron build complete!');
  })
  .catch((error) => {
    console.error('✗ Failed to build preload script:', error);
    process.exit(1);
  });

