// Ouvre admin.html sur le faux backend, pour vérifier l'onglet « Fournisseurs »
// dans un navigateur sans toucher à Supabase ni au fournisseur :
//
//   cd scripts/test/sync-supplier && npm install && node serve-admin.mjs [--port 3100]
//
// Démarre : PGlite + faux PostgREST/Auth (schéma réel + fixture), faux
// fournisseur, un passage `--record` du synchroniseur (pour avoir des
// propositions), puis un serveur statique du dépôt dont `js/config.js` est
// remplacé par l'adresse du faux backend. Connexion : admin@test.invalid /
// test-password. Ctrl+C pour tout arrêter.

import http from 'node:http';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startMockBackend } from './mock-postgrest.mjs';
import { startMockSupplier } from './mock-supplier.mjs';
import { seed, supplierProducts, SUPPLIER_CODE } from './fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 3100;

const backend = await startMockBackend();
const supplier = await startMockSupplier({ products: supplierProducts() });
await backend.db.exec(await readFile(path.join(HERE, 'schema-stub.sql'), 'utf8'));
await backend.db.exec(await readFile(path.join(ROOT, 'supabase', 'sql', 'product_sources.sql'), 'utf8'));
await backend.db.exec(await readFile(path.join(ROOT, 'supabase', 'sql', 'sync_supplier.sql'), 'utf8'));
await seed(backend.db);

const tmp = await mkdtemp(path.join(os.tmpdir(), 'dn-sync-admin-'));
const cfg = path.join(tmp, 'supplier.test.json');
await writeFile(cfg, JSON.stringify({ code: SUPPLIER_CODE, baseUrl: supplier.baseUrl, storeApiPath: '/wp-json/wc/store/v1' }));
const scenario = process.argv.includes('--scenario-promo-end');
async function record() {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'sync-supplier.mjs'), '--record', '--work', path.join(tmp, 'run-' + Date.now()), '--supplier-config', cfg],
      { env: { ...process.env, DN_SUPABASE_URL: backend.url, DN_SUPABASE_KEY: 'test-service-key', DN_SYNC_DELAY_MS: '0' }, cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
    child.on('close', code => (code === 0 ? resolve() : reject(new Error('record a échoué ' + code))));
  });
}
await record();
if (scenario) { // Yara 50 ml : fin de promo → promo_end / dn_below_supplier visibles dans l'onglet
  await backend.db.query(`insert into public.product_supply (product_id, variant_id, stock_mode) values ('00000000-0000-4000-8000-000000000001', null, 'on_demand')`);
  await backend.db.query(`insert into public.product_supply (product_id, variant_id, base_price) values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 15)`);
  supplier.set(1051, { regular: 14.9, price: 14.9 });
  supplier.set(1001, { regular: 14.9, price: 14.9 });
  await record();
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };
const configJs = `const SUPABASE_URL  = '${backend.url}';\nconst SUPABASE_ANON = 'test-anon-key';\nconst WHATSAPP_NUMBER = '0000000000';\n`;
const site = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/js/config.js') { res.writeHead(200, { 'Content-Type': MIME['.js'] }); return res.end(configJs); }
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise(r => site.listen(port, '127.0.0.1', r));
console.log(`Admin de test : http://127.0.0.1:${port}/admin.html  (admin@test.invalid / test-password)\nFaux Supabase : ${backend.url} · faux fournisseur : ${supplier.baseUrl}`);
process.on('SIGINT', async () => { site.close(); await supplier.close(); await backend.close(); process.exit(0); });
