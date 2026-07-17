#!/usr/bin/env node
// Génère le HTML de navigation depuis data/nav.config.json + partials/nav.html.
//
// Phase 3.3 : ce script ne fait qu'un rendu EN MÉMOIRE et une auto-vérification
// (idempotence, absence de jeton oublié). Il n'écrit ENCORE aucun fichier —
// l'injection réelle dans les 19 pages (via les marqueurs <!-- AUTO:NAV:START/
// END --> à poser sur chaque page) est prévue pour une phase ultérieure
// (Phase 3.4, canari, puis rollout), pas ici.
//
// Convention reprise de scripts/generate-parfums.mjs : zéro dépendance npm,
// fetch/fs natifs de Node (>=18), aucune valeur métier codée en dur — tout
// vient de data/nav.config.json, jamais du script.
//
// Principe de marqueurs explicites (imposé pour toute la Phase 3, y compris
// en interne) : ce script n'extrait JAMAIS ses blocs par une recherche
// approximative de balise ou de classe CSS. Il cherche des paires de
// marqueurs exactes et échoue bruyamment si l'une d'elles est absente,
// dupliquée ou mal ordonnée.

import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('..', import.meta.url);
const NAV_CONFIG_PATH = new URL('data/nav.config.json', ROOT);
const NAV_TEMPLATE_PATH = new URL('partials/nav.html', ROOT);

// ============================================================
// Liste des pages servies concernées par l'injection de la nav.
// Isolée dans cette unique constante (recommandation explicite) plutôt que
// dispersée dans le code — toute évolution (nouvelle page catégorie, nouvelle
// marque parfums) se fait ici et nulle part ailleurs dans ce script.
//
// Ne peut pas être dérivée de data/nav.config.json : ce fichier décrit CE QUE
// dit la navigation (ses entrées), pas OÙ elle doit être injectée — par
// exemple parfums/lecode/ et parfums/khair/ ne sont pas des entrées de
// nav.config.json (une seule entrée "parfums" pointe vers le hub), mais sont
// bien deux pages servies qui doivent recevoir le même bloc de navigation.
//
// Non consommée par ce script en Phase 3.3 (aucune écriture n'a lieu) —
// préparée pour la Phase 3.4+.
// ============================================================
export const TARGET_PAGES = [
  'index.html',
  'abayas/index.html',
  'accessoires/index.html',
  'bakhour/index.html',
  'brumes/index.html',
  'chaussures/index.html',
  'chechias/index.html',
  'gelules/index.html',
  'huiles/index.html',
  'miels/index.html',
  'miels-gourmands/index.html',
  'miels-terroir/index.html',
  'poudres/index.html',
  'qamis/index.html',
  'tahara/index.html',
  'parfums/index.html',
  'parfums/lecode/index.html',
  'parfums/khair/index.html',
];

function log(msg) { console.log(msg); }

// ============================================================
// 1. Chargement de la configuration
// ============================================================

async function loadNavConfig(path = NAV_CONFIG_PATH) {
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch (e) {
    throw new Error(`Impossible de lire nav.config (${path}) : ${e.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`nav.config n'est pas un JSON valide (${path}) : ${e.message}`);
  }
}

// ============================================================
// 2. Validation de la configuration
//    (mêmes contrôles que la vérification de complétude de la Phase 3.1,
//    désormais intégrés au script plutôt qu'à un script ad hoc externe)
// ============================================================

function validateNavConfig(config) {
  const errors = [];
  const allIds = [];
  const allHrefs = [];

  if (!config || !Array.isArray(config.entries) || config.entries.length === 0) {
    return { valid: false, errors: ["'entries' absent, vide ou n'est pas un tableau"] };
  }

  function checkNode(node, depth, path) {
    const required = ['id', 'label', 'type', 'scope'];
    for (const key of required) {
      if (!(key in node)) errors.push(`${path}: champ manquant "${key}"`);
    }
    allIds.push(node.id);

    if (!['all', 'homepage'].includes(node.scope)) {
      errors.push(`${path}: scope invalide "${node.scope}"`);
    }

    if (node.type === 'link') {
      if ('children' in node) errors.push(`${path}: un lien ne doit pas avoir "children"`);
      if (!node.href) {
        errors.push(`${path}: lien orphelin (pas de href)`);
      } else {
        if (!(node.href.startsWith('/') || node.href.startsWith('https://dar-nur.fr'))) {
          errors.push(`${path}: href suspect "${node.href}"`);
        }
        allHrefs.push(node.href);
      }
    } else if (node.type === 'group') {
      if ('href' in node) errors.push(`${path}: un groupe ne doit pas avoir "href"`);
      if (!Array.isArray(node.children) || node.children.length === 0) {
        errors.push(`${path}: groupe vide (aucun enfant)`);
      } else {
        if (depth >= 2) errors.push(`${path}: profondeur > 2 niveaux (groupe imbriqué non supporté)`);
        node.children.forEach((child, i) => {
          if (child.type === 'group') {
            errors.push(`${path}.children[${i}]: un groupe ne peut pas contenir un autre groupe`);
          }
          checkNode(child, depth + 1, `${path}.children[${i}]`);
        });
      }
    } else {
      errors.push(`${path}: type invalide "${node.type}"`);
    }
  }

  config.entries.forEach((entry, i) => checkNode(entry, 1, `entries[${i}]`));

  const idCounts = countOccurrences(allIds);
  const dupIds = Object.keys(idCounts).filter(id => idCounts[id] > 1);
  if (dupIds.length) errors.push(`ids dupliqués : ${dupIds.join(', ')}`);

  const hrefCounts = countOccurrences(allHrefs);
  const dupHrefs = Object.keys(hrefCounts).filter(h => hrefCounts[h] > 1);
  if (dupHrefs.length) errors.push(`hrefs dupliqués : ${dupHrefs.join(', ')}`);

  return { valid: errors.length === 0, errors };
}

function countOccurrences(values) {
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  return counts;
}

// ============================================================
// 3. Chargement + extraction du template
// ============================================================

async function loadTemplateRaw(path = NAV_TEMPLATE_PATH) {
  try {
    return await readFile(path, 'utf8');
  } catch (e) {
    throw new Error(`Impossible de lire le template (${path}) : ${e.message}`);
  }
}

// Extraction stricte par marqueurs exacts — jamais de correspondance
// approximative. Échoue si le marqueur est absent, dupliqué, ou si START
// apparaît après END.
function extractMarkedBlock(source, startMarker, endMarker, label) {
  const startIdx = source.indexOf(startMarker);
  const endIdx = source.indexOf(endMarker);

  if (startIdx === -1) throw new Error(`Marqueur "${startMarker}" introuvable (${label})`);
  if (endIdx === -1) throw new Error(`Marqueur "${endMarker}" introuvable (${label})`);
  if (source.indexOf(startMarker, startIdx + 1) !== -1) {
    throw new Error(`Marqueur "${startMarker}" dupliqué (${label})`);
  }
  if (source.indexOf(endMarker, endIdx + 1) !== -1) {
    throw new Error(`Marqueur "${endMarker}" dupliqué (${label})`);
  }
  if (endIdx < startIdx) throw new Error(`Marqueur "${endMarker}" trouvé avant "${startMarker}" (${label})`);

  return source.slice(startIdx + startMarker.length, endIdx).trim();
}

function extractTemplateParts(templateRaw) {
  return {
    skeleton: extractMarkedBlock(
      templateRaw, '<!-- NAV:SKELETON:START -->', '<!-- NAV:SKELETON:END -->', 'partials/nav.html — squelette'
    ),
    linkBlock: extractMarkedBlock(
      templateRaw, '<!-- NAV:TEMPLATE:LINK:START -->', '<!-- NAV:TEMPLATE:LINK:END -->', 'partials/nav.html — gabarit lien'
    ),
    groupBlock: extractMarkedBlock(
      templateRaw, '<!-- NAV:TEMPLATE:GROUP:START -->', '<!-- NAV:TEMPLATE:GROUP:END -->', 'partials/nav.html — gabarit groupe'
    ),
  };
}

// ============================================================
// 4. Calcul des chemins (LOGO_SRC)
// ============================================================

// Racine-absolu, volontairement identique quelle que soit la page — décidé
// ici (au niveau du build), pas dans le template, conformément à la
// recommandation : le template expose un jeton, le script décide la valeur.
// Pas de calcul de profondeur nécessaire : un chemin racine-absolu se
// résout correctement depuis n'importe quelle profondeur de page sur ce
// domaine (contrairement à un chemin relatif ../ qui varie par page).
function computeLogoSrc(/* pageRelativePath, non utilisé pour l'instant */) {
  return '/logo-dar-nur.png';
}

// ============================================================
// 5. Substitution de jetons
// ============================================================

function substitute(template, values) {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) {
      throw new Error(`Valeur manquante pour le jeton {{${key}}}`);
    }
    result = result.split(`{{${key}}}`).join(value);
  }
  return result;
}

// ============================================================
// 6. Rendu des entrées (récursif : link | group)
// ============================================================

function renderLinkEntry(entry, linkBlock, activeHref) {
  const isActive = activeHref != null && entry.href === activeHref;
  return substitute(linkBlock, {
    HREF: entry.href,
    ID: entry.id,
    LABEL: entry.label,
    ACTIVE_ATTR: isActive ? 'aria-current="page"' : '',
  });
}

function renderGroupEntry(entry, blocks, activeHref) {
  const childrenHtml = entry.children
    .map(child => renderLinkEntry(child, blocks.linkBlock, activeHref))
    .join('\n');
  const groupIsActive = activeHref != null && entry.children.some(c => c.href === activeHref);
  return substitute(blocks.groupBlock, {
    ID: entry.id,
    LABEL: entry.label,
    GROUP_CHILDREN: childrenHtml,
    GROUP_ACTIVE_ATTR: groupIsActive ? 'aria-current="true"' : '',
  });
}

function renderEntry(entry, blocks, activeHref) {
  if (entry.type === 'link') return renderLinkEntry(entry, blocks.linkBlock, activeHref);
  if (entry.type === 'group') return renderGroupEntry(entry, blocks, activeHref);
  throw new Error(`Type d'entrée inconnu : "${entry.type}" (id: ${entry.id})`);
}

function renderNavEntries(config, blocks, activeHref) {
  return config.entries.map(entry => renderEntry(entry, blocks, activeHref)).join('\n');
}

// ============================================================
// 7. Rendu du squelette complet
// ============================================================

function renderSkeleton(skeleton, { logoSrc, navEntriesHtml }) {
  return substitute(skeleton, {
    LOGO_SRC: logoSrc,
    NAV_ENTRIES: navEntriesHtml,
  });
}

// ============================================================
// 8. Validation finale — aucun jeton {{...}} oublié dans la sortie
// ============================================================

function assertNoLeftoverPlaceholders(html, label) {
  const leftover = html.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover) {
    throw new Error(`Jeton(s) non substitué(s) dans ${label} : ${[...new Set(leftover)].join(', ')}`);
  }
}

// ============================================================
// Orchestrateur — rendu complet EN MÉMOIRE, aucune écriture disque.
// ============================================================

export async function buildNavHtml({
  configPath = NAV_CONFIG_PATH,
  templatePath = NAV_TEMPLATE_PATH,
  activeHref = null,
} = {}) {
  const config = await loadNavConfig(configPath);

  const { valid, errors } = validateNavConfig(config);
  if (!valid) {
    throw new Error(`nav.config invalide :\n  - ${errors.join('\n  - ')}`);
  }

  const templateRaw = await loadTemplateRaw(templatePath);
  const blocks = extractTemplateParts(templateRaw);

  const navEntriesHtml = renderNavEntries(config, blocks, activeHref);
  assertNoLeftoverPlaceholders(navEntriesHtml, 'NAV_ENTRIES');

  const logoSrc = computeLogoSrc();
  const finalHtml = renderSkeleton(blocks.skeleton, { logoSrc, navEntriesHtml });
  assertNoLeftoverPlaceholders(finalHtml, 'squelette final');

  return finalHtml;
}

// ============================================================
// 9. Injection dans une page servie — Phase 3.4+.
//    Toujours par marqueurs exacts (réutilise extractMarkedBlock), jamais
//    par recherche de <header> ou de classe CSS. N'écrit sur disque QUE si
//    write === true est explicitement passé — par défaut, purement en
//    mémoire (prepareInjection ne prend aucun paramètre d'écriture, seul
//    injectIntoPage peut écrire, et seulement sur demande explicite).
// ============================================================

const PAGE_MARKER_START = '<!-- AUTO:NAV:START -->';
const PAGE_MARKER_END = '<!-- AUTO:NAV:END -->';

async function readPageFile(pagePath) {
  try {
    return await readFile(pagePath, 'utf8');
  } catch (e) {
    throw new Error(`Impossible de lire la page (${pagePath}) : ${e.message}`);
  }
}

function extractCurrentNavBlock(pageContent, label) {
  return extractMarkedBlock(pageContent, PAGE_MARKER_START, PAGE_MARKER_END, label);
}

function replaceNavBlock(pageContent, newBlock, label) {
  const startIdx = pageContent.indexOf(PAGE_MARKER_START);
  const endIdx = pageContent.indexOf(PAGE_MARKER_END);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Marqueurs AUTO:NAV absents (${label}) — bootstrap requis avant injection`);
  }
  const before = pageContent.slice(0, startIdx + PAGE_MARKER_START.length);
  const after = pageContent.slice(endIdx);
  return `${before}\n${newBlock}\n${after}`;
}

// Rendu + lecture de la page cible, sans jamais écrire. Retourne tout ce
// qu'il faut pour un diff humain avant toute décision d'écriture.
export async function prepareInjection(pagePath, { activeHref = null } = {}) {
  const pageContent = await readPageFile(pagePath);
  const oldBlock = extractCurrentNavBlock(pageContent, pagePath);
  const newBlock = await buildNavHtml({ activeHref });
  const updatedContent = replaceNavBlock(pageContent, newBlock, pagePath);
  return {
    oldBlock,
    newBlock,
    changed: oldBlock !== newBlock,
    updatedContent,
  };
}

// Seule fonction de tout ce script capable d'écrire sur disque, et
// uniquement si write === true est passé explicitement par l'appelant.
export async function injectIntoPage(pagePath, { activeHref = null, write = false } = {}) {
  const result = await prepareInjection(pagePath, { activeHref });
  if (write) {
    await writeFile(pagePath, result.updatedContent, 'utf8');
  }
  return result;
}

// ============================================================
// 10. Artefact commun pour l'intégration avec generate-parfums.mjs
//    (Phase 3.6.1). Un seul fichier généré, JAMAIS édité à la main —
//    partials/nav-common.generated.html — contenant deux fragments
//    nommés délimités par marqueurs, que generate-parfums.mjs (Phase
//    3.6.3, pas encore écrite) lira et insérera dans ses propres
//    templates. build-nav.mjs ne modifie ni ne lit AUCUN fichier
//    appartenant à generate-parfums.mjs (templates, pages parfums,
//    sitemap.xml) — cette fonction ne fait qu'ÉCRIRE son propre
//    artefact.
//
//    Le point de coupure entre les deux fragments est purement
//    structurel : la position de l'entrée dont l'id vaut "parfums"
//    dans nav.config.json. Aucune notion de marque n'existe ici.
// ============================================================

const COMMON_NAV_ARTIFACT_PATH = new URL('partials/nav-common.generated.html', ROOT);
const PARFUMS_SPLIT_ID = 'parfums';

function splitEntriesAtParfums(entries) {
  const idx = entries.findIndex(e => e.id === PARFUMS_SPLIT_ID);
  if (idx === -1) {
    throw new Error(
      `Aucune entrée avec id === "${PARFUMS_SPLIT_ID}" trouvée dans nav.config — ` +
      `impossible de déterminer le point de coupure du fragment commun.`
    );
  }
  return {
    before: entries.slice(0, idx),
    after: entries.slice(idx + 1),
  };
}

function wrapNamedFragment(name, html) {
  return `<!-- ${name} -->\n${html}\n<!-- /${name} -->`;
}

// Rendu des deux fragments en mémoire, sans jamais écrire. activeHref reste
// volontairement null : ce fragment est partagé par plusieurs pages de
// destination (hub + une par marque), aucune ne peut être "la" page courante
// au niveau du fragment lui-même (question de conception déjà documentée,
// non résolue ici par choix — hors périmètre de cette sous-phase).
export async function buildCommonNavFragments({
  configPath = NAV_CONFIG_PATH,
  templatePath = NAV_TEMPLATE_PATH,
} = {}) {
  const config = await loadNavConfig(configPath);

  const { valid, errors } = validateNavConfig(config);
  if (!valid) {
    throw new Error(`nav.config invalide :\n  - ${errors.join('\n  - ')}`);
  }

  const templateRaw = await loadTemplateRaw(templatePath);
  const blocks = extractTemplateParts(templateRaw);

  const { before, after } = splitEntriesAtParfums(config.entries);

  const beforeHtml = before.map(entry => renderEntry(entry, blocks, null)).join('\n');
  const afterHtml = after.map(entry => renderEntry(entry, blocks, null)).join('\n');

  assertNoLeftoverPlaceholders(beforeHtml, 'COMMON_NAV_BEFORE_PARFUMS');
  assertNoLeftoverPlaceholders(afterHtml, 'COMMON_NAV_AFTER_PARFUMS');

  return { beforeHtml, afterHtml };
}

// Assemble le contenu complet du fichier artefact (les deux fragments
// nommés). Toujours en mémoire, aucune écriture ici.
export async function renderCommonNavArtifact(opts = {}) {
  const { beforeHtml, afterHtml } = await buildCommonNavFragments(opts);
  return [
    '<!--',
    '  partials/nav-common.generated.html — ARTEFACT GÉNÉRÉ, NE JAMAIS ÉDITER À LA MAIN.',
    '  Produit par scripts/build-nav.mjs (fonction writeCommonNavArtifact) depuis',
    '  data/nav.config.json + partials/nav.html. Toute correction se fait à la',
    '  source, jamais ici — ce fichier est réécrit intégralement à chaque exécution.',
    '',
    '  Consommé par scripts/generate-parfums.mjs (Phase 3.6.3) qui extrait les deux',
    '  fragments nommés ci-dessous et les insère dans ses propres templates via les',
    '  jetons {{COMMON_NAV_BEFORE_PARFUMS}} / {{COMMON_NAV_AFTER_PARFUMS}}. Son propre',
    '  dropdown "Parfums" (par marque) se place entre les deux, en dehors de cet',
    '  artefact — build-nav.mjs ne connaît aucune marque.',
    '-->',
    '',
    wrapNamedFragment('COMMON_NAV_BEFORE_PARFUMS', beforeHtml),
    '',
    wrapNamedFragment('COMMON_NAV_AFTER_PARFUMS', afterHtml),
    '',
  ].join('\n');
}

// Seule fonction capable d'écrire partials/nav-common.generated.html, et
// uniquement si write === true. Toujours un remplacement intégral du
// fichier (il est 100% généré, aucune portion n'est jamais préservée d'un
// run à l'autre) — contrairement à injectIntoPage qui ne touche qu'un
// fragment d'une page existante.
export async function writeCommonNavArtifact({ write = false, ...opts } = {}) {
  const content = await renderCommonNavArtifact(opts);
  let existing = null;
  try {
    existing = await readFile(COMMON_NAV_ARTIFACT_PATH, 'utf8');
  } catch {
    existing = null;
  }
  const changed = existing !== content;
  if (write) {
    await writeFile(COMMON_NAV_ARTIFACT_PATH, content, 'utf8');
  }
  return { content, changed };
}

// ============================================================
// Rapport de vérification (dry-run) — lecture seule, aucune écriture.
// Exécuté uniquement à l'appel manuel de ce script (node scripts/build-nav.mjs),
// jamais déclenché automatiquement par un workflow à ce stade de la Phase 3.
// ============================================================

async function main() {
  log('build-nav.mjs — rendu à blanc (Phase 3.3, aucune écriture disque)\n');

  const html1 = await buildNavHtml();
  log('✔ Rendu complet réussi (config valide, template extrait, aucun jeton oublié).');

  const html2 = await buildNavHtml();
  const idempotent = html1 === html2;
  log(idempotent
    ? '✔ Idempotence confirmée : deux exécutions successives produisent un HTML strictement identique.'
    : '✘ ÉCHEC idempotence : deux exécutions ont produit des résultats différents.');
  if (!idempotent) process.exitCode = 1;

  const liCount = (html1.match(/<li /g) || []).length;
  log(`\nRésumé du rendu :`);
  log(`  - ${liCount} <li> générés au total.`);
  log(`  - ${TARGET_PAGES.length} pages cibles déclarées pour une future injection (non utilisées ici).`);
  log(`\n--- Aperçu (300 premiers caractères) ---`);
  log(html1.slice(0, 300) + '…');
}

// Ne s'exécute qu'en appel direct (node scripts/build-nav.mjs), jamais lors
// d'un import — ce script est destiné à être importé pour ses tests unitaires
// (voir la Phase 3.4+) sans déclencher le rapport à chaque fois. C'est aussi
// ce qui garantit qu'aucune exécution automatique n'a lieu tant que rien ne
// l'invoque explicitement en CLI.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => {
    console.error(`::error::${e.stack || e.message}`);
    process.exitCode = 1;
  });
}
