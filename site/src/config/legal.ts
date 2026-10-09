/**
 * Faits juridiques de Dar Nûr (étape 12), source unique des pages /cgv/, /confidentialite/ et
 * /mentions-legales/. RÈGLE : uniquement des faits fournis par l'exploitant ou vérifiés ; une
 * information inconnue vaut `null` et n'est JAMAIS remplacée par une valeur plausible.
 *
 * Faits communiqués par l'exploitant : entrepreneur individuel, micro-entreprise, activité
 * commerciale, franchise en base de TVA (9 octobre 2026) ; immatriculation au RNE depuis le
 * 2 octobre 2026, SIREN et SIRET (document officiel RNE, communiqué le 9 octobre 2026).
 *
 * Graphie : « Dar Nûr » dans les pages juridiques et les informations officielles ; « Dar Nūr »
 * reste la graphie du branding (logo, identité visuelle, titres du site).
 *
 * Activité : Mode (vêtements) et Soins restent vendus (catalogue et pages juridiques inchangés).
 * L'intitulé d'activité sera vérifié au RNE (SIREN/SIRET reçus le 9 octobre 2026) ; si nécessaire, une
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
  /** Vrai seulement quand la version est juridiquement finalisée (aucun autre blocage). */
  final: false,
};

export const legalEntity = {
  /** Graphie officielle (pages juridiques) ; le branding du site reste « Dar Nūr ». */
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
   * Numéro professionnel public (décision du 9 octobre 2026) : utilisé principalement sur
   * WhatsApp, il peut aussi être appelé. Ne jamais écrire « WhatsApp uniquement ».
   */
  phone: '07 69 25 33 75' as string | null,
  phoneInternational: '+33 7 69 25 33 75',
  phoneHref: 'tel:+33769253375',
  siren: '130 776 743' as string | null,
  siret: '130 776 743 00010' as string | null,
  registry: 'Registre national des entreprises (RNE)',
  registeredSince: '2 octobre 2026',
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
 * confidentialité de Netlify (mise à jour du 10 avril 2026). Aucun numéro de téléphone public
 * officiel identifiable : laissé EN ATTENTE, jamais déduit d'une source non officielle.
 */
export const host = {
  name: 'Netlify, Inc.',
  address: '101 2nd Street, San Francisco, CA 94105, États-Unis',
  phone: null as string | null,
  website: 'https://www.netlify.com',
};

/**
 * Suivi anonyme des e-mails transactionnels Brevo : Paramètres → Automatisations → Emails
 * transactionnels → Suivi → « Suivi anonyme des emails » = Oui (réglage manuel de l'exploitant).
 * Passer à `true` uniquement après configuration constatée. Le webhook de délivrabilité (étape 11)
 * n'est pas concerné.
 */
export const brevoAnonymousTrackingConfirmed = false;

/**
 * Fonctionnalité de rétractation en ligne (« renoncer au contrat ici ») : obligatoire pour les
 * contrats conclus au moyen d'une interface en ligne depuis le 19 juin 2026 (art. L. 221-21 du code
 * de la consommation, ordonnance n° 2026-2 ; modalités : décret n° 2026-3). Absente du site.
 */
export const onlineWithdrawalFunction = false;

/** Informations ou dispositifs obligatoires manquants : tant qu'il en reste, rien n'ouvre en production. */
export function legalBlockers(): string[] {
  const blockers: string[] = [];
  if (!legalEntity.siren || !legalEntity.siret)
    blockers.push('SIREN/SIRET et confirmation de l’immatriculation non encore obtenus');
  if (!legalEntity.phone) blockers.push('numéro de téléphone du vendeur non publié');
  if (!mediator) blockers.push('médiateur de la consommation non désigné');
  if (!host.phone)
    blockers.push('numéro de téléphone de l’hébergeur : aucun numéro public officiel identifié (en attente)');
  if (!brevoAnonymousTrackingConfirmed)
    blockers.push('suivi anonyme des e-mails transactionnels Brevo non encore activé et constaté');
  if (!onlineWithdrawalFunction)
    blockers.push(
      'fonctionnalité de rétractation en ligne « renoncer au contrat ici » absente (art. L. 221-21, depuis le 19 juin 2026)',
    );
  if (!legalVersion.final)
    blockers.push('version juridique à finaliser une fois les points ci-dessus réglés');
  return blockers;
}
