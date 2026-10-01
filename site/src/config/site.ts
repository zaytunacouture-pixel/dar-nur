import { DAR_NUR_ENV } from 'astro:env/server';

/** Environnement courant (development | preprod | production). */
export const siteEnv = DAR_NUR_ENV;

/** Seule la production autorise l'indexation. Toute autre valeur = noindex. */
export const isIndexable = siteEnv === 'production';

export const siteName = 'Dar Nūr';

export const defaultDescription =
  'Dar Nūr — miels, herboristerie, parfums, soins et mode modeste, choisis avec soin.';

/** Couleur de l'interface du navigateur : doit rester égale à --dn-bg (tokens.css). */
export const themeColor = '#fbf8f2';
