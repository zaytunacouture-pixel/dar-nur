#!/usr/bin/env node
/**
 * Instantané des regroupements Mode et doublons PROPOSÉS (étape 6) pour la page LAB
 * /lab/regroupements/ (étape 8).
 *
 * Pourquoi un instantané versionné : `product_groupings` et `product_grouping_members` sont
 * réservés à l'admin (RLS) ; le build ne lit Supabase qu'avec la clé publique. Le build
 * combine donc cet instantané (décisions proposées) avec le catalogue public lu en direct
 * (photos, prix, tailles, disponibilité).
 *
 * LECTURE SEULE : une requête SELECT via la CLI Supabase authentifiée du propriétaire
 * (`npx supabase login`). Aucune écriture en base.
 *
 * Usage (depuis la racine du dépôt) :
 *   node site/scripts/lab/export-product-groupings.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_REF = 'sxlpgcnjerlayitaxxyv';
const repo = fileURLToPath(new URL('../../..', import.meta.url));
const output = fileURLToPath(new URL('../../src/data/lab/product-groupings.json', import.meta.url));

const sql = `
select g.code, g.kind, g.decision, g.proposed_name, g.proposed_slug, g.option_type_id,
       bp.slug as base_slug, g.note, g.updated_at,
       coalesce((select json_agg(json_build_object(
                  'slug', p.slug,
                  'label', m.proposed_value_label,
                  'label_source', m.label_source) order by p.sort_order, p.slug)
                 from public.product_grouping_members m
                 join public.products p on p.id = m.product_id
                 where m.grouping_id = g.id), '[]') as members
from public.product_groupings g
left join public.products bp on bp.id = g.base_product_id
order by g.decision desc, g.code;`;

const dir = mkdtempSync(join(tmpdir(), 'dn-groupings-'));
const file = join(dir, 'export.sql');
writeFileSync(file, sql);
const raw = execFileSync(
  'npx',
  ['supabase', 'db', 'query', '--linked', '--project-ref', PROJECT_REF, '-f', file, '-o', 'json'],
  { cwd: repo, encoding: 'utf8', shell: process.platform === 'win32' },
);
const start = raw.indexOf('{');
const { rows } = JSON.parse(raw.slice(start));
if (!Array.isArray(rows) || rows.length === 0) throw new Error('Aucun regroupement lu : export interrompu.');

const groupings = rows.map((row) => ({
  code: row.code,
  kind: row.kind,
  decision: row.decision,
  proposedName: row.proposed_name,
  proposedSlug: row.proposed_slug,
  axis: row.option_type_id,
  baseSlug: row.base_slug,
  note: row.note,
  updatedAt: row.updated_at,
  members: row.members.map((m) => ({ slug: m.slug, label: m.label, labelSource: m.label_source })),
}));

writeFileSync(
  output,
  `${JSON.stringify(
    {
      source: 'product_groupings + product_grouping_members (lecture admin, CLI Supabase)',
      exportedAt: new Date().toISOString().slice(0, 10),
      groupings,
    },
    null,
    2,
  )}\n`,
);
console.log(`${groupings.length} regroupements écrits dans ${output}`);
