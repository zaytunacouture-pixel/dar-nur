// @ts-check
import { writeFile } from 'node:fs/promises';
import { defineConfig, envField, fontProviders } from 'astro/config';

/**
 * Environnement Dar Nūr. Seule la valeur "production" autorise l'indexation.
 * Netlify fixe "preprod" pour TOUS ses contextes (voir netlify.toml) : le
 * contexte « production » de Netlify est notre préproduction, pas dar-nur.fr.
 */
const DAR_NUR_ENV = process.env.DAR_NUR_ENV ?? 'development';
const INDEXABLE = DAR_NUR_ENV === 'production';

/** URL absolue du site (canonical, Open Graph). Netlify fournit DEPLOY_PRIME_URL / URL. */
const SITE_URL =
  process.env.SITE_URL ?? process.env.DEPLOY_PRIME_URL ?? process.env.URL ?? 'http://localhost:4321';

// Doit rester identique à UNICODE_RANGE de scripts/fonts/build-fonts.py.
/** @type {[string, ...string[]]} */
const UNICODE_RANGE = [
  'U+0020-007E',
  'U+00A0-00FF',
  'U+0152-0153',
  'U+016A-016B',
  'U+0178',
  'U+2010',
  'U+2013-2014',
  'U+2018-201A',
  'U+201C-201E',
  'U+2026',
  'U+2039-203A',
  'U+20AC',
  'U+2122',
  'U+2212',
];

/**
 * En-tête X-Robots-Tag écrit dans dist/_headers selon l'environnement : impossible
 * d'oublier de le retirer (ou de l'ajouter) lors d'une future bascule.
 * @returns {import('astro').AstroIntegration}
 */
function robotsHeaders() {
  return {
    name: 'dar-nur-robots-headers',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const body = INDEXABLE
          ? '# Production : indexation autorisée.\n'
          : '/*\n  X-Robots-Tag: noindex, nofollow\n';
        await writeFile(new URL('_headers', dir), body);
        logger.info(`_headers écrit (DAR_NUR_ENV=${DAR_NUR_ENV}, indexable=${INDEXABLE})`);
      },
    },
  };
}

export default defineConfig({
  site: SITE_URL,
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  compressHTML: true,
  devToolbar: { enabled: false },
  integrations: [robotsHeaders()],

  env: {
    schema: {
      DAR_NUR_ENV: envField.enum({
        context: 'server',
        access: 'public',
        values: ['development', 'preprod', 'production'],
        default: 'development',
      }),
      // Lecture seule : URL du projet et clé « publishable » (publique par conception,
      // sous RLS). Contexte serveur : utilisées au build uniquement, jamais dans le bundle client.
      SUPABASE_URL: envField.string({ context: 'server', access: 'public', optional: true }),
      SUPABASE_ANON_KEY: envField.string({ context: 'server', access: 'public', optional: true }),
    },
  },

  image: {
    // Images catalogue existantes : chemins relatifs servis par dar-nur.fr, ou stockage Supabase.
    remotePatterns: [
      { protocol: 'https', hostname: 'dar-nur.fr' },
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
    responsiveStyles: false,
  },

  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Cormorant Garamond',
      cssVariable: '--dn-font-cormorant',
      fallbacks: ['Georgia', 'serif'],
      unicodeRange: UNICODE_RANGE,
      options: {
        variants: [
          {
            src: ['./src/assets/fonts/cormorant-garamond-500-600.woff2'],
            weight: '500 600',
            style: 'normal',
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Jost',
      cssVariable: '--dn-font-jost',
      fallbacks: ['Arial', 'sans-serif'],
      unicodeRange: UNICODE_RANGE,
      options: {
        variants: [{ src: ['./src/assets/fonts/jost-400-500.woff2'], weight: '400 500', style: 'normal' }],
      },
    },
  ],
});
