/**
 * Faits juridiques de Dar Nūr (étape 12), source unique des pages /cgv/, /confidentialite/ et
 * /mentions-legales/. RÈGLE : uniquement des faits fournis par l'exploitant ou vérifiés ; une
 * information inconnue vaut `null` et n'est JAMAIS remplacée par une valeur plausible.
 *
 * Faits communiqués par l'exploitant le 9 octobre 2026 (synthèse de dépôt INPI) :
 * entrepreneur individuel, micro-entreprise, activité commerciale, début d'activité déclaré le
 * 1er octobre 2026, franchise en base de TVA. SIREN/SIRET non encore connus : l'immatriculation
 * n'est pas considérée comme prouvée.
 *
 * Activité : Mode (vêtements) et Soins restent vendus (catalogue et pages juridiques inchangés).
 * L'intitulé d'activité sera vérifié au RNE après réception du SIREN/SIRET ; si nécessaire, une
 * adjonction d'activité sera effectuée via le Guichet unique (décision de l'exploitant, 9 octobre 2026).
 *
 * Tant que `legalBlockers()` n'est pas vide : bandeau « non finalisé » sur les pages juridiques,
 * commande en ligne impossible à ouvrir en production (commande.astro, ApiConfig.astro) et
 * build de production refusé (scripts/verify-legal.mjs).
 */

export const legalVersion = {
  /** Identifiant affiché sur les pages ; à enregistrer comme terms_version une fois finalisé. */
  id: 'cgv-2026-10-09-preprod',
  date: '9 octobre 2026',
  /** Vrai seulement quand la version est juridiquement finalisée (aucun blocage). */
  final: false,
};

export const legalEntity = {
  /** Graphie telle que communiquée par l'exploitant (« Dar Nûr ») : à confirmer sur le document INPI. */
  tradeName: 'Dar Nûr',
  operator: 'Youcef ZAHI',
  /** La loi impose la mention « entrepreneur individuel » ou « EI » à côté du nom. */
  legalForm: 'entrepreneur individuel (EI)',
  regime: 'micro-entreprise',
  address: {
    line1: '1 allée de la Noue Brossard',
    postalCode: '77500',
    city: 'Chelles',
    country: 'France',
  },
  email: 'contact@dar-nur.fr',
  /**
   * Décision de l'exploitant (9 octobre 2026) : aucun numéro affiché. Le Code de la consommation
   * (art. R. 111-1, 1°) et la LCEN demandent pourtant un numéro de téléphone : point bloquant.
   */
  phone: null as string | null,
  /** Inconnus à ce jour : ne jamais inventer. */
  siren: null as string | null,
  siret: null as string | null,
  vatMention: 'TVA non applicable, article 293 B du code général des impôts',
  publicationDirector: 'Youcef ZAHI',
};

/** Adresse postale complète, sur une ligne (le contrôle juridique l'autorise telle quelle). */
export const legalAddressLine = `${legalEntity.address.line1}, ${legalEntity.address.postalCode} ${legalEntity.address.city}, ${legalEntity.address.country}`;

/** Adresse de retour des produits (rétractation, garanties) : identique à l'établissement. */
export const returnAddressLine = legalAddressLine;

/** Médiateur de la consommation (obligatoire) : aucun choisi à ce jour. */
export const mediator = null as null | { name: string; address: string; website: string };

/**
 * Hébergeur du site (refonte Astro, Netlify). Raison sociale et adresse : politique de
 * confidentialité de Netlify (mise à jour du 10 avril 2026). Aucun numéro de téléphone publié
 * par Netlify sur ses pages officielles consultées : point bloquant (LCEN).
 */
export const host = {
  name: 'Netlify, Inc.',
  address: '101 2nd Street, San Francisco, CA 94105, États-Unis',
  phone: null as string | null,
  website: 'https://www.netlify.com',
};

/**
 * Suivi des ouvertures et des clics des e-mails Brevo. Constaté ACTIF pour les clics à l'étape 11
 * (liens réécrits par Brevo). Aucun réglage en libre-service ni paramètre d'API connu : la
 * désactivation se demande au support Brevo. Passer à `true` uniquement après confirmation écrite.
 */
export const emailTrackingDisabledConfirmed = false;

/** Informations obligatoires manquantes : tant qu'il en reste, rien n'ouvre en production. */
export function legalBlockers(): string[] {
  const blockers: string[] = [];
  if (!legalEntity.siren || !legalEntity.siret)
    blockers.push('SIREN/SIRET et confirmation de l’immatriculation non encore obtenus');
  if (!mediator) blockers.push('médiateur de la consommation non désigné');
  if (!legalEntity.phone)
    blockers.push(
      'numéro de téléphone du vendeur non publié (exigé par le Code de la consommation et la LCEN)',
    );
  if (!host.phone) blockers.push('numéro de téléphone de l’hébergeur à vérifier (LCEN)');
  if (!emailTrackingDisabledConfirmed)
    blockers.push('désactivation du suivi des ouvertures et des clics Brevo non confirmée');
  if (!legalVersion.final)
    blockers.push(
      'vérification finale des informations légales (graphie du nom commercial, textes en vigueur)',
    );
  return blockers;
}
