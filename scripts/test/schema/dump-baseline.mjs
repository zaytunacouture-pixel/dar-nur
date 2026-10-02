// Fige le schéma RÉEL de production (schéma public : tables, contraintes, index,
// fonctions, triggers, politiques RLS, droits) dans baseline.sql, pour que le
// banc PGlite teste les migrations sur une copie fidèle — sans aucune donnée.
//
//   node scripts/test/schema/dump-baseline.mjs
//
// Lecture seule, via la CLI Supabase déjà authentifiée (npx supabase login).
// Seule adaptation : notify_github_regenerate() (pg_net + vault, absents de PGlite)
// est remplacée par un bouchon qui journalise l'appel dans test.notify_log — ce qui
// permet justement de vérifier qu'une migration ne déclenche aucune régénération.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'sxlpgcnjerlayitaxxyv';

function query(sql) {
  const dir = mkdtempSync(path.join(tmpdir(), 'dn-baseline-'));
  const file = path.join(dir, 'q.sql');
  writeFileSync(file, sql);
  try {
    const out = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '--project-ref', PROJECT_REF, '-f', file, '-o', 'json'],
      { shell: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 });
    const json = JSON.parse(out.slice(out.indexOf('{')));
    return json.rows;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const columns = query(`
  select c.relname as tbl, a.attname as col, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as notnull,
         pg_get_expr(d.adbin, d.adrelid) as def, a.attidentity as ident
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid and c.relkind = 'r' and c.relnamespace = 'public'::regnamespace
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attnum > 0 and not a.attisdropped
   order by c.relname, a.attnum`);
const constraints = query(`
  select conrelid::regclass::text as tbl, conname as name, contype as type, pg_get_constraintdef(oid) as def
    from pg_constraint where connamespace = 'public'::regnamespace and contype in ('p', 'u', 'c', 'f')
   order by case contype when 'p' then 0 when 'u' then 1 when 'c' then 2 else 3 end, conrelid::regclass::text, conname`);
const indexes = query(`
  select i.indexrelid::regclass::text as name, pg_get_indexdef(i.indexrelid) as def
    from pg_index i join pg_class c on c.oid = i.indrelid and c.relnamespace = 'public'::regnamespace
   where not exists (select 1 from pg_constraint k where k.conindid = i.indexrelid)
   order by 1`);
const functions = query(`
  select p.proname as name, pg_get_functiondef(p.oid) as def
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1`);
const triggers = query(`
  select t.tgname as name, pg_get_triggerdef(t.oid) as def
    from pg_trigger t join pg_class c on c.oid = t.tgrelid and c.relnamespace = 'public'::regnamespace
   where not t.tgisinternal order by c.relname, t.tgname`);
const policies = query(`
  select tablename as tbl, policyname as name, permissive, roles, cmd, qual, with_check
    from pg_policies where schemaname = 'public' order by tablename, policyname`);
const rls = query(`select relname as tbl, relrowsecurity as on from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1`);
const grants = query(`
  select table_name as tbl, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'authenticated')
   group by table_name, grantee order by 1, 2`);

const tables = [...new Set(columns.map((c) => c.tbl))];
const out = [];
out.push('-- Schéma public de PRODUCTION figé par dump-baseline.mjs (ne pas modifier à la main).');
out.push(`-- Généré le ${new Date().toISOString()} — aucune donnée.`);
out.push('');
out.push('-- Socle Supabase émulé : rôles, auth.uid(), auth.users, droits par défaut.');
out.push(`do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;`);
out.push('create schema if not exists auth;');
out.push('create table if not exists auth.users (id uuid primary key, email text);');
out.push(`create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;`);
out.push('grant usage on schema public, auth to anon, authenticated;');
out.push('grant execute on function auth.uid() to anon, authenticated;');
out.push('alter default privileges in schema public grant all on tables to anon, authenticated;');
out.push('create schema if not exists test;');
out.push('create table test.notify_log (id serial primary key, event text, tbl text, op text, at timestamptz default clock_timestamp());');
out.push('');

for (const t of tables) {
  const cols = columns.filter((c) => c.tbl === t).map((c) => {
    let s = `  ${JSON.stringify(c.col)} ${c.type}`;
    if (c.ident === 'a') s += ' generated always as identity';
    else if (c.ident === 'd') s += ' generated by default as identity';
    else if (c.def) s += ` default ${c.def}`;
    if (c.notnull) s += ' not null';
    return s;
  });
  out.push(`create table public.${t} (\n${cols.join(',\n')}\n);`);
}
out.push('');
for (const k of constraints) out.push(`alter table ${k.tbl} add constraint ${k.name} ${k.def};`);
out.push('');
for (const i of indexes) out.push(`${i.def};`);
out.push('');
for (const f of functions) {
  if (f.name === 'notify_github_regenerate') {
    out.push(`CREATE OR REPLACE FUNCTION public.notify_github_regenerate()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  -- BOUCHON DE TEST : en production, appel HTTP repository_dispatch vers GitHub.
  insert into test.notify_log (event, tbl, op) values (coalesce(TG_ARGV[0], 'regenerate-parfums'), TG_TABLE_NAME, TG_OP);
  return coalesce(new, old);
end;
$function$;`);
  } else {
    out.push(`${f.def.trim()};`);
  }
}
out.push('');
for (const t of triggers) out.push(`${t.def};`);
out.push('');
for (const r of rls) if (r.on) out.push(`alter table public.${r.tbl} enable row level security;`);
for (const p of policies) {
  const roles = (Array.isArray(p.roles) ? p.roles : String(p.roles).replace(/[{}]/g, '').split(',')).join(', ');
  let s = `create policy ${JSON.stringify(p.name)} on public.${p.tbl} as ${p.permissive.toLowerCase()} for ${p.cmd.toLowerCase()} to ${roles}`;
  if (p.qual) s += ` using (${p.qual})`;
  if (p.with_check) s += ` with check (${p.with_check})`;
  out.push(`${s};`);
}
out.push('');
out.push('-- Droits réels (les droits par défaut ci-dessus valent pour les NOUVELLES tables).');
for (const t of tables) out.push(`revoke all on public.${t} from anon, authenticated;`);
for (const g of grants) out.push(`grant ${g.privs.toLowerCase()} on public.${g.tbl} to ${g.grantee};`);
out.push('grant usage on schema test to anon, authenticated;');
out.push('grant select, insert on test.notify_log to anon, authenticated;');
out.push('grant usage on all sequences in schema test to anon, authenticated;');
out.push('grant usage on all sequences in schema public to anon, authenticated;');
out.push('');

writeFileSync(path.join(HERE, 'baseline.sql'), out.join('\n'));
console.log(`baseline.sql : ${tables.length} tables, ${constraints.length} contraintes, ${indexes.length} index, ${functions.length} fonctions, ${triggers.length} triggers, ${policies.length} politiques.`);
