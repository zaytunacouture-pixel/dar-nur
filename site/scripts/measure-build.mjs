#!/usr/bin/env node
/**
 * Mesure reproductible du build (étape 8B) : temps total, génération des pages, images.
 *
 *   node scripts/measure-build.mjs --cold   # supprime dist/ ET le cache Astro (images, polices,
 *                                           # Vite) : équivaut à un `npm ci` sur machine neuve
 *   node scripts/measure-build.mjs --warm   # supprime seulement dist/ : cache Astro conservé
 *
 * Ne touche à rien d'autre (dépendances, .env, sources). Le cache Astro vit dans
 * node_modules/.astro (cacheDir par défaut) : c'est exactement ce que `npm ci` efface.
 * Sortie : journal complet dans le dossier temporaire du système puis un résumé JSON (temps, nombre de
 * transformations par format, cache utilisé ou non, temps CPU cumulé par format).
 */
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const mode = process.argv.includes('--warm') ? 'warm' : process.argv.includes('--cold') ? 'cold' : null;
if (!mode) {
  console.error('Usage : node scripts/measure-build.mjs --cold | --warm');
  process.exit(2);
}

const removed = ['dist', ...(mode === 'cold' ? ['node_modules/.astro', 'node_modules/.vite'] : [])];
for (const dir of removed) await rm(join(root, dir), { recursive: true, force: true });

const logPath = join(tmpdir(), `dar-nur-build-${mode}.log`);
const log = createWriteStream(logPath);
const started = performance.now();
const output = await new Promise((resolve, reject) => {
  let text = '';
  const child = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build'], {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => {
      text += chunk;
      log.write(chunk);
    });
  child.on('error', reject);
  child.on('close', (code) => (code === 0 ? resolve(text) : reject(new Error(`astro build : code ${code}`))));
});
const totalSeconds = (performance.now() - started) / 1000;
log.end();

/** « 21m 29s » | « 9.74s » | « 91ms » → secondes. */
const seconds = (value) => {
  const m = /(?:(\d+)m\s*)?(?:([\d.]+)s)?(?:([\d.]+)ms)?/.exec(value.trim());
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) + Number(m[3] ?? 0) / 1000 : NaN;
};
const lines = output.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/);
const imagesStart = lines.findIndex((line) => line.includes('generating optimized images'));
const completedAfter = (index) => {
  const line = lines.slice(index + 1).find((l) => /Completed in/.test(l));
  return line ? seconds(/Completed in ([^.]*\d[^ ]*)\.?$/.exec(line)?.[1] ?? '') : NaN;
};
const pagesStart = lines.findIndex((line) => line.includes('generating static routes'));

const images = { total: 0, misses: 0, hits: 0, byFormat: {} };
for (const line of lines) {
  const m = /▶ \/_astro\/\S+\.(\w+) \((.*?)\) \(\+([\d.]+)(ms|s)\)/.exec(line);
  if (!m) continue;
  const [, format, detail, value, unit] = m;
  const ms = unit === 's' ? Number(value) * 1000 : Number(value);
  const entry = (images.byFormat[format] ??= { count: 0, cpuSeconds: 0, outputKB: 0 });
  entry.count++;
  entry.cpuSeconds += ms / 1000;
  const after = /after: (\d+)kB/.exec(detail);
  if (after) entry.outputKB += Number(after[1]);
  images.total++;
  if (detail.startsWith('before')) images.misses++;
  else images.hits++;
}
for (const entry of Object.values(images.byFormat)) entry.cpuSeconds = Math.round(entry.cpuSeconds);

console.log(
  JSON.stringify(
    {
      mode,
      removed,
      log: logPath,
      cpus: availableParallelism(),
      totalSeconds: Math.round(totalSeconds),
      pagesSeconds: pagesStart >= 0 ? completedAfter(pagesStart) : null,
      imagesSeconds: imagesStart >= 0 ? completedAfter(imagesStart) : null,
      images,
    },
    null,
    2,
  ),
);
