#!/usr/bin/env node
// Vérifie l'indexabilité réelle de chaque fiche produit statique générée par
// generate-product-pages.mjs : fichier présent, tags SEO cohérents, présence
// dans le sitemap, correspondance avec les produits actifs Supabase, et
// (option --prod) code HTTP réel en production.
//
// Usage : node scripts/verify-product-pages.mjs [--prod]
// Aucune dépendance npm : fetch natif de Node (>=18).

import { readFile, access } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const CHECK_PROD = process.argv.includes('--prod');

function log(msg) { console.log(msg); }
function fail(scope, msg) { console.error(`  ✘ [${scope}] ${msg}`); }

async function loadSupabaseCreds() {
  const raw = await readFile(new URL('js/config.js', ROOT), 'utf8');
  const urlMatch = raw.match(/SUPABASE_URL\s*=\s*'([^']+)'/);
  const keyMatch = raw.match(/SUPABASE_ANON\s*=\s*'([^']+)'/);
  return { url: urlMatch[1], key: keyMatch[1] };
}

async function fetchActiveProducts(creds) {
  const url = `${creds.url}/rest/v1/products?select=id,slug,name,active&active=eq.true&order=sort_order.asc`;
  const res = await fetch(url, { headers: { apikey: creds.key, Authorization: `Bearer ${creds.key}` } });
  if (!res.ok) throw new Error(`Supabase a répondu ${res.status}`);
  return res.json();
}

function checkPageHtml(slug, html, errors) {
  const expectedCanonical = `https://dar-nur.fr/${slug}/`;

  if (/<meta[^>]+name=["']robots["'][^>]*noindex/i.test(html)) {
    errors.push(`meta robots noindex présent`);
  }

  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  if (!titleMatch || !titleMatch[1].trim()) errors.push('title manquant');
  else if (titleMatch[1].includes('Dar Nūr — Produits Naturels & Mode Islamique Premium')) errors.push('title générique (pas réécrit pour ce produit)');

  const descMatch = html.match(/<meta name="description" content="([^"]*)"/);
  if (!descMatch || !descMatch[1].trim()) errors.push('meta description manquante');

  const canonicalMatch = html.match(/<link rel="canonical" href="([^"]*)"/);
  if (!canonicalMatch) errors.push('canonical manquant');
  else if (canonicalMatch[1] !== expectedCanonical) errors.push(`canonical incorrect : ${canonicalMatch[1]} (attendu ${expectedCanonical})`);

  const ogUrlMatch = html.match(/<meta property="og:url" content="([^"]*)"/);
  if (!ogUrlMatch || ogUrlMatch[1] !== expectedCanonical) errors.push('og:url ne correspond pas au canonical');

  const productViewMatch = html.match(/<div id="productView"[^>]*>([\s\S]*?)<\/div>\s*\n\s*<!-- ============ MOBILE BAR/);
  const productViewHtml = productViewMatch ? productViewMatch[1] : '';
  if (!/style="display:block"/.test(html.match(/<div id="productView"[^>]*>/)?.[0] || '')) {
    errors.push('#productView pas visible par défaut (contenu invisible sans JS)');
  }
  const h1Match = productViewHtml.match(/<h1>([^<]*)<\/h1>/);
  if (!h1Match || !h1Match[1].trim()) errors.push('h1 produit manquant dans le HTML statique');
  if (productViewHtml.replace(/<[^>]+>/g, '').trim().length < 20) {
    errors.push('contenu produit quasi vide dans le HTML statique (hors JS)');
  }

  if (!/<main id="homeView" style="display:none">/.test(html)) {
    errors.push('#homeView pas masqué par défaut (flash de la page d\'accueil avant JS)');
  }
}

async function main() {
  const creds = await loadSupabaseCreds();
  log('▶ Vérification des fiches produit statiques');

  let active;
  try {
    active = await fetchActiveProducts(creds);
  } catch (e) {
    console.error(`Impossible de lire Supabase (${e.message}) — vérification limitée aux fichiers locaux.`);
    active = null;
  }

  const manifest = JSON.parse(await readFile(new URL('scripts/.generated-product-slugs.json', ROOT), 'utf8'));
  const sitemap = await readFile(new URL('sitemap.xml', ROOT), 'utf8');
  const robots = await readFile(new URL('robots.txt', ROOT), 'utf8');

  let okCount = 0;
  const problems = [];

  if (active) {
    const activeSlugs = new Set(active.map(p => p.slug));
    const manifestSet = new Set(manifest);
    const missing = active.filter(p => !manifestSet.has(p.slug));
    const orphaned = manifest.filter(s => !activeSlugs.has(s));
    if (missing.length) problems.push({ scope: 'catalogue', errors: [`${missing.length} produit(s) actif(s) sans page générée : ${missing.map(p => p.slug).join(', ')}`] });
    if (orphaned.length) problems.push({ scope: 'catalogue', errors: [`${orphaned.length} page(s) générée(s) pour un produit non actif/supprimé : ${orphaned.join(', ')}`] });
  }

  for (const slug of manifest) {
    const errors = [];
    let html;
    try {
      await access(new URL(`${slug}/index.html`, ROOT));
      html = await readFile(new URL(`${slug}/index.html`, ROOT), 'utf8');
    } catch {
      errors.push('fichier index.html introuvable');
    }

    if (html) checkPageHtml(slug, html, errors);

    if (!sitemap.includes(`<loc>https://dar-nur.fr/${slug}/</loc>`)) errors.push('absent du sitemap.xml');
    if (new RegExp(`Disallow:\\s*/${slug}/?\\b`).test(robots)) errors.push('bloqué par robots.txt');

    if (errors.length) problems.push({ scope: slug, errors });
    else okCount++;
  }

  log(`  ${okCount}/${manifest.length} fiche(s) conforme(s).`);
  if (problems.length) {
    log(`  ${problems.length} problème(s) détecté(s) :`);
    for (const p of problems) {
      for (const e of p.errors) fail(p.scope, e);
    }
  }

  if (CHECK_PROD) {
    log('▶ Vérification HTTP en production (dar-nur.fr) — peut prendre un moment...');
    let prodErrors = 0;
    for (const slug of manifest) {
      const url = `https://dar-nur.fr/${slug}/`;
      try {
        const res = await fetch(url, { redirect: 'manual' });
        if (res.status >= 300 && res.status < 400) {
          fail(slug, `redirection HTTP ${res.status} vers ${res.headers.get('location')}`);
          prodErrors++;
        } else if (res.status !== 200) {
          fail(slug, `HTTP ${res.status} en production`);
          prodErrors++;
        }
        const xRobots = res.headers.get('x-robots-tag');
        if (xRobots && /noindex/i.test(xRobots)) {
          fail(slug, `X-Robots-Tag: ${xRobots}`);
          prodErrors++;
        }
        if (res.status === 200) {
          const html = await res.text();
          const bodyErrors = [];
          checkPageHtml(slug, html, bodyErrors);
          if (bodyErrors.length) {
            for (const e of bodyErrors) fail(slug, `[HTML] ${e}`);
            prodErrors++;
          }
        }
      } catch (e) {
        fail(slug, `requête échouée : ${e.message}`);
        prodErrors++;
      }
    }
    log(`  Production : ${manifest.length - prodErrors}/${manifest.length} URL(s) en 200 sans blocage.`);
  }

  if (problems.length || (CHECK_PROD && process.exitCode)) process.exitCode = 1;
}

main().catch(e => {
  console.error(`::error:: ${e.stack || e.message}`);
  process.exitCode = 1;
});
