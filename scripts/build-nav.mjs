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

import { readFile } from 'node:fs/promises';
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
  'bijoux/index.html',
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
