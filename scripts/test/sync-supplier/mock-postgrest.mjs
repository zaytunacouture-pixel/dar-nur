// Faux PostgREST au-dessus de PGlite (Postgres en WASM, en mémoire) : le
// sous-ensemble de l'API REST Supabase utilisé par scripts/sync-supplier.mjs,
// js/supabase-client.js et js/admin-supply.js, exécuté contre le VRAI schéma
// SQL du dépôt (supabase/sql/*.sql). Sert aussi un faux Auth (session admin
// de test) pour ouvrir admin.html sur ce backend.
//
// Rôle Postgres choisi d'après le porteur, comme PostgREST : clé de service de
// test → propriétaire (contourne la RLS), jeton de session de test →
// authenticated + auth.uid() de l'admin de test, tout autre porteur → anon.
// La RLS s'exerce donc aussi à travers HTTP ; run.mjs la teste en plus par SQL.
//
// Journalise chaque écriture (method, table, query, body) : c'est la preuve
// utilisée par les tests pour affirmer qu'aucun corps de requête ne contient
// `active` ni `coming_soon`.

import { PGlite } from '@electric-sql/pglite';
import http from 'node:http';

const EMBED_FK = { products: { product_variants: 'product_id' }, offers: { offer_products: 'offer_id' } };

export async function startMockBackend({ port = 0, testUser } = {}) {
  const db = new PGlite();
  const typeCache = new Map();
  const writes = [];
  const user = testUser || { id: '11111111-1111-4111-8111-111111111111', email: 'admin@test.invalid', password: 'test-password' };

  async function columnTypes(table) {
    if (!typeCache.has(table)) {
      const r = await db.query(`select column_name, data_type, udt_name from information_schema.columns where table_schema='public' and table_name=$1`, [table]);
      if (!r.rows.length) throw Object.assign(new Error(`relation "public.${table}" does not exist`), { status: 404 });
      typeCache.set(table, new Map(r.rows.map(x => [x.column_name, x])));
    }
    return typeCache.get(table);
  }
  const invalidateTypes = () => typeCache.clear();

  function castParam(col, types) {
    const t = types.get(col);
    if (!t) throw Object.assign(new Error(`column "${col}" does not exist`), { status: 400 });
    if (t.data_type === 'ARRAY') return { expr: n => `(select coalesce(array_agg(x), '{}') from jsonb_array_elements_text($${n}::jsonb) x)::${t.udt_name.replace(/^_/, '')}[]`, enc: v => JSON.stringify(v ?? []) };
    if (t.data_type === 'jsonb' || t.data_type === 'json') return { expr: n => `$${n}::jsonb`, enc: v => JSON.stringify(v ?? null) };
    const sqlType = t.data_type === 'USER-DEFINED' ? t.udt_name : t.data_type;
    return { expr: n => `$${n}::${sqlType}`, enc: v => (v === undefined ? null : v) };
  }

  function outRow(row, types) {
    const o = {};
    for (const [k, v] of Object.entries(row)) {
      const t = types?.get(k);
      if (v instanceof Date) o[k] = v.toISOString();
      else if (typeof v === 'bigint') o[k] = Number(v);
      else if (t && (t.data_type === 'numeric' || t.data_type === 'integer' || t.data_type === 'bigint') && v != null) o[k] = Number(v);
      else o[k] = v;
    }
    return o;
  }

  function splitTop(s) {
    const out = []; let depth = 0, cur = '';
    for (const ch of s) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
    }
    if (cur) out.push(cur);
    return out.map(x => x.trim()).filter(Boolean);
  }

  function parseSelect(sel) {
    const cols = [], embeds = [];
    for (const item of splitTop(sel || '*')) {
      const m = item.match(/^([a-z_]+)\((.*)\)$/);
      if (m) embeds.push({ table: m[1], select: m[2] || '*' });
      else cols.push(item);
    }
    return { cols, embeds };
  }

  function whereFrom(params, types, startIdx = 1) {
    const clauses = [], values = [];
    let n = startIdx;
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(k)) continue;
      const m = v.match(/^(eq|neq|gt|gte|lt|lte|like|ilike|is|in)\.(.*)$/s);
      if (!m) throw Object.assign(new Error(`filtre non pris en charge : ${k}=${v}`), { status: 400 });
      const [, op, raw] = m;
      const q = `"${k}"`;
      const cast = castParam(k, types);
      if (op === 'is') { clauses.push(raw === 'null' ? `${q} is null` : `${q} is ${raw}`); continue; }
      if (op === 'in') {
        const items = raw.replace(/^\(|\)$/g, '').split(',').map(s => s.trim().replace(/^"|"$/g, ''));
        clauses.push(`${q} in (${items.map(() => cast.expr(n++)).join(',')})`);
        values.push(...items.map(cast.enc));
        continue;
      }
      const sqlOp = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like', ilike: 'ilike' }[op];
      clauses.push(`${q} ${sqlOp} ${cast.expr(n++)}`);
      values.push(cast.enc(raw));
    }
    return { sql: clauses.length ? ' where ' + clauses.join(' and ') : '', values, next: n };
  }

  function orderFrom(params) {
    const o = params.get('order');
    if (!o) return '';
    return ' order by ' + o.split(',').map(part => {
      const [col, dir, nulls] = part.split('.');
      return `"${col}" ${dir === 'desc' ? 'desc' : 'asc'}${nulls === 'nullsfirst' ? ' nulls first' : nulls === 'nullslast' ? ' nulls last' : ''}`;
    }).join(', ');
  }

  async function select(table, params) {
    const types = await columnTypes(table);
    const { cols, embeds } = parseSelect(params.get('select'));
    const w = whereFrom(params, types);
    const colSql = cols.length === 1 && cols[0] === '*' ? '*' : [...new Set([...cols, 'id'])].map(c => `"${c}"`).join(', ');
    let sql = `select ${colSql} from "${table}"${w.sql}${orderFrom(params)}`;
    if (params.get('limit')) sql += ` limit ${Number(params.get('limit'))}`;
    if (params.get('offset')) sql += ` offset ${Number(params.get('offset'))}`;
    const r = await db.query(sql, w.values);
    let rows = r.rows.map(x => outRow(x, types));
    for (const e of embeds) {
      const fk = EMBED_FK[table]?.[e.table];
      if (!fk) throw Object.assign(new Error(`embed non pris en charge : ${table} → ${e.table}`), { status: 400 });
      const ctypes = await columnTypes(e.table);
      const ids = rows.map(x => x.id);
      const children = ids.length ? (await db.query(`select * from "${e.table}" where "${fk}" = any($1::uuid[])`, [ids])).rows.map(x => outRow(x, ctypes)) : [];
      for (const row of rows) row[e.table] = children.filter(c => c[fk] === row.id);
    }
    if (!cols.includes('*') && !cols.includes('id')) rows = rows.map(({ id, ...rest }) => rest);
    return rows;
  }

  async function insert(table, params, body, prefer) {
    const types = await columnTypes(table);
    const rows = Array.isArray(body) ? body : [body];
    const columnsParam = params.get('columns') ? params.get('columns').split(',') : null;
    const out = [];
    const upsert = /resolution=merge-duplicates/.test(prefer);
    for (const row of rows) {
      const keys = Object.keys(row).filter(k => !columnsParam || columnsParam.includes(k));
      const casts = keys.map(k => castParam(k, types));
      const conflict = upsert ? ` on conflict (${params.get('on_conflict') || 'id'}) do update set ${keys.map(k => `"${k}" = excluded."${k}"`).join(', ')}` : '';
      const sql = keys.length
        ? `insert into "${table}" (${keys.map(k => `"${k}"`).join(', ')}) values (${casts.map((c, i) => c.expr(i + 1)).join(', ')})${conflict} returning *`
        : `insert into "${table}" default values returning *`;
      const r = await db.query(sql, keys.map((k, i) => casts[i].enc(row[k])));
      out.push(...r.rows.map(x => outRow(x, types)));
    }
    return out;
  }

  async function update(table, params, body) {
    const types = await columnTypes(table);
    const columnsParam = params.get('columns') ? params.get('columns').split(',') : null;
    const keys = Object.keys(body).filter(k => !columnsParam || columnsParam.includes(k));
    const casts = keys.map(k => castParam(k, types));
    const w = whereFrom(params, types, keys.length + 1);
    if (!w.sql) throw Object.assign(new Error('PATCH sans filtre refusé'), { status: 400 });
    const sql = `update "${table}" set ${keys.map((k, i) => `"${k}" = ${casts[i].expr(i + 1)}`).join(', ')}${w.sql} returning *`;
    const r = await db.query(sql, [...keys.map((k, i) => casts[i].enc(body[k])), ...w.values]);
    return r.rows.map(x => outRow(x, types));
  }

  async function remove(table, params) {
    const types = await columnTypes(table);
    const w = whereFrom(params, types);
    if (!w.sql) throw Object.assign(new Error('DELETE sans filtre refusé'), { status: 400 });
    const r = await db.query(`delete from "${table}"${w.sql} returning *`, w.values);
    return r.rows.map(x => outRow(x, types));
  }

  function session() {
    return { access_token: 'test-access-token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'test-refresh-token',
      user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
  }

  // Rôle Postgres selon le porteur (comme PostgREST) : clé de service → propriétaire
  // (contourne la RLS) ; jeton de session de test → authenticated + auth.uid() ;
  // tout autre porteur (clé anon publique) → anon. Une requête à la fois.
  let chain = Promise.resolve();
  const withRole = (bearer, fn) => {
    const run = async () => {
      const role = bearer === 'test-service-key' ? null : bearer === 'test-access-token' ? 'authenticated' : 'anon';
      if (role) { await db.exec(`set role ${role}`); await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [role === 'authenticated' ? user.id : '']); }
      try { return await fn(); } finally { if (role) { await db.exec('reset role'); await db.query(`select set_config('request.jwt.claim.sub', '', false)`); } }
    };
    const p = chain.then(run, run);
    chain = p.catch(() => {});
    return p;
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const text = Buffer.concat(chunks).toString('utf8');
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', ...headers });
      res.end(body === undefined ? '' : JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') return send(204);
    try {
      if (url.pathname.startsWith('/auth/v1/')) {
        if (url.pathname === '/auth/v1/token') {
          const grant = url.searchParams.get('grant_type');
          const b = text ? JSON.parse(text) : {};
          if (grant === 'password' && !(b.email === user.email && b.password === user.password)) return send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
          return send(200, session());
        }
        if (url.pathname === '/auth/v1/user') return send(200, session().user);
        if (url.pathname === '/auth/v1/logout') return send(204);
        return send(404, { message: 'auth endpoint inconnu' });
      }
      const m = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
      if (!m) return send(404, { message: `route inconnue ${url.pathname}` });
      const table = m[1];
      const prefer = req.headers.prefer || '';
      const single = /vnd\.pgrst\.object/.test(req.headers.accept || '');
      const finish = rows => {
        if (single) return rows.length === 1 ? send(200, rows[0]) : send(406, { code: 'PGRST116', message: `${rows.length} rows` });
        return send(200, rows);
      };
      if (req.method === 'GET') return finish(await withRole(bearer, () => select(table, url.searchParams)));
      const body = text ? JSON.parse(text) : {};
      writes.push({ method: req.method, table, query: url.search, body, role: bearer === 'test-service-key' ? 'service' : bearer === 'test-access-token' ? 'authenticated' : 'anon' });
      let rows;
      if (req.method === 'POST') rows = await withRole(bearer, () => insert(table, url.searchParams, body, prefer));
      else if (req.method === 'PATCH') rows = await withRole(bearer, () => update(table, url.searchParams, body));
      else if (req.method === 'DELETE') rows = await withRole(bearer, () => remove(table, url.searchParams));
      else return send(405, { message: 'méthode' });
      if (/return=representation/.test(prefer)) return finish(rows);
      return send(req.method === 'POST' ? 201 : 204);
    } catch (e) {
      const denied = /permission denied/.test(e.message);
      return send(e.status || (denied ? 401 : 400), { message: e.message, code: denied ? '42501' : (e.code || null) });
    }
  });

  await new Promise(r => server.listen(port, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { db, url, writes, user, invalidateTypes, close: () => new Promise(r => server.close(r)).then(() => db.close()) };
}
