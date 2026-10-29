// Serveur local du banc (127.0.0.1 uniquement) : /js/* et /admin.html depuis le dépôt,
// /fixtures/* depuis le dossier de fichiers de test, / → harness.html.
// node scripts/test/admin-images/serve.mjs <dossier-fixtures> [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const FIXTURES = path.resolve(process.argv[2] || '');
const PORT = Number(process.argv[3] || 8765);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic' };

function resolve(urlPath) {
  const p = decodeURIComponent(urlPath.split('?')[0]);
  if (p === '/' || p === '/harness.html') return path.join(HERE, 'harness.html');
  const [base, rel] = p.startsWith('/fixtures/') ? [FIXTURES, p.slice('/fixtures/'.length)] : [ROOT, p.slice(1)];
  const full = path.resolve(base, rel);
  return full.startsWith(base + path.sep) ? full : null;
}

createServer(async (req, res) => {
  const file = resolve(req.url);
  try {
    if (!file) throw new Error('hors racine');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('introuvable');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`banc : http://127.0.0.1:${PORT}/`));
