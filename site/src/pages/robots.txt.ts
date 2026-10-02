import type { APIRoute } from 'astro';
import { isIndexable } from '@/config/site';

/**
 * robots.txt selon l'environnement. Hors production : tout est interdit, aucun sitemap annoncé.
 * En production : le sitemap des pages catalogue (écrit par astro.config.mjs, catalogSitemap).
 */
export const GET: APIRoute = ({ site }) =>
  new Response(
    isIndexable
      ? `User-agent: *\nAllow: /\n${site ? `Sitemap: ${new URL('/sitemap.xml', site).toString()}\n` : ''}`
      : 'User-agent: *\nDisallow: /\n',
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
