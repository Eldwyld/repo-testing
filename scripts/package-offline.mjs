// Assemble the offline package after `vite build --mode offline`:
//
//   dist-offline/
//     app/                               the built web app (from Vite)
//     Start JOI Forge (Windows).bat      launchers (from offline/)
//     Start JOI Forge (Mac).command
//     start-linux.sh, serve.py, serve.ps1, README.txt
//     VERSION.txt
//   release/joi-forge-offline.zip        (when the `zip` command is available)
//
// No dependencies; run with `node scripts/package-offline.mjs`.
import { execSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-offline');
const app = join(out, 'app');
const launchers = join(root, 'offline');

if (!existsSync(join(app, 'index.html'))) {
  console.error('dist-offline/app is missing. Run `npm run build:offline`.');
  process.exit(1);
}

for (const name of readdirSync(launchers)) {
  copyFileSync(join(launchers, name), join(out, name));
}
for (const name of [
  'Start JOI Forge (Mac).command',
  'start-linux.sh',
  'serve.py',
]) {
  chmodSync(join(out, name), 0o755);
}

const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: root })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
})();
writeFileSync(
  join(out, 'VERSION.txt'),
  `JOI Forge offline build\ncommit: ${commit}\nbuilt: ${new Date().toISOString()}\n`
);

const release = join(root, 'release');
mkdirSync(release, { recursive: true });
const zipPath = join(release, 'joi-forge-offline.zip');
rmSync(zipPath, { force: true });
const zip = spawnSync('zip', ['-r', '-q', '-X', zipPath, '.'], {
  cwd: out,
  stdio: 'inherit',
});
if (zip.error || zip.status !== 0) {
  console.log(
    `Packaged folder: ${out} (zip not available, so no .zip was made)`
  );
} else {
  console.log(`Packaged: ${out}\nZip:      ${zipPath}`);
}
