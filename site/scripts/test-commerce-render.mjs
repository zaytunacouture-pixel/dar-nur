/** Rendu réel de composants Astro, sans serveur Vite, réseau, variables ou catalogue réel. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { dirname, resolve, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transform } from '@astrojs/compiler-rs';
import ts from 'typescript';
import { experimental_AstroContainer } from 'astro/container';
import { storefrontFlags } from '../src/lib/commerce/storefront.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = await mkdtemp(join(root, '.commerce-render-'));
const compiled = new Map();
const written = [];
async function compile(filename) {
  if (compiled.has(filename)) return compiled.get(filename);
  const target = join(temp, `${compiled.size}.mjs`);
  compiled.set(filename, target);
  let source = await readFile(filename, 'utf8');
  if (extname(filename) === '.astro') {
    source = transform(source, {
      filename: filename.replaceAll('\\', '/'),
      internalURL: 'astro/compiler-runtime',
      resultScopedSlot: true,
      resolvePath: (specifier) => specifier,
    }).code;
  }
  // Le Container contrôle le HTML, pas le pipeline CSS de Vite.
  source = source.replace(/^import\s+["'][^"'\n]*\?astro&type=style[^"'\n]*["'];?\s*$/gm, '');
  let code = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  for (const match of [...code.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)]) {
    const spec = match[1];
    let replacement;
    if (spec.endsWith('?raw')) {
      const raw = await readFile(fileURLToPath(import.meta.resolve(spec.slice(0, -4))), 'utf8');
      replacement = `data:text/javascript,${encodeURIComponent(`export default ${JSON.stringify(raw)}`)}`;
    } else if (spec.startsWith('@/') || spec.startsWith('.')) {
      let dependency = spec.startsWith('@/')
        ? resolve(root, 'src', spec.slice(2))
        : resolve(dirname(filename), spec);
      if (!extname(dependency)) dependency += '.ts';
      replacement = pathToFileURL(await compile(dependency)).href;
    }
    if (replacement)
      code = code
        .replaceAll(JSON.stringify(spec), JSON.stringify(replacement))
        .replaceAll(`'${spec}'`, JSON.stringify(replacement));
  }
  await writeFile(target, code);
  written.push(target);
  return target;
}
try {
  const load = async (path) => (await import(pathToFileURL(await compile(resolve(root, path))).href)).default;
  const Link = await load('src/components/product/StorefrontLink.astro');
  const Notice = await load('src/components/order/CommerceNotice.astro');
  const container = await experimental_AstroContainer.create();
  const render = (component, props) => container.renderToString(component, { props });
  const choice = {
    action: 'shopify-link',
    url: 'https://shop.dar-nur.fr/products/fictif?variant=4242',
    price: { kind: 'fixed', amount: 30 },
    availability: 'available',
    message: 'Fictif',
  };
  const html = await render(Link, { choice });
  assert.match(html, /href="https:\/\/shop.dar-nur.fr\/products\/fictif\?variant=4242"/);
  assert.match(html, /Acheter sur la boutique \(site externe\)/);
  assert.doesNotMatch(html, /<button/);
  for (const action of ['none', 'unavailable']) {
    const disabled = await render(Link, {
      choice: { ...choice, action, url: null, message: 'Indisponible' },
    });
    assert.doesNotMatch(disabled, /<a |<button/);
    assert.match(disabled, /aria-disabled="true"/);
    assert.match(disabled, /Indisponible/);
  }
  for (const mode of ['shopify', 'disabled']) {
    const html = await render(Notice, { view: storefrontFlags(mode) });
    assert.doesNotMatch(html, /<form|<button|check_cart|create_order_request|localStorage/);
    assert.match(html, /href="\/suivi\/"/);
    assert.equal(html.includes('href="https://shop.dar-nur.fr"'), mode === 'shopify');
  }
  console.log('  ✓ Container Astro : liens exacts, états inactifs, panier/commande sans formulaire et suivi');
} finally {
  for (const path of written) await unlink(path);
  await rmdir(temp);
}
