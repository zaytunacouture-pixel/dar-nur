import type { APIRoute } from 'astro';
import { isIndexable } from '@/config/site';

/**
 * robots.txt selon l'environnement. Hors production : tout est interdit.
 * Le sitemap de production sera ajouté à l'étape de migration SEO — jamais une URL de préproduction.
 */
export const GET: APIRoute = () =>
  new Response(isIndexable ? 'User-agent: *\nAllow: /\n' : 'User-agent: *\nDisallow: /\n', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
