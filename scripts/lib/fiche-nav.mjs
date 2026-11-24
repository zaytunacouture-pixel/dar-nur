// Navigation des fiches éditoriales : mêmes fragments communs que les pages
// marque (partials/nav-common.generated.html) et même règle de publication des
// marques que scripts/generate-parfums.mjs (active + au moins un parfum actif).

import { readFile } from 'node:fs/promises';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function buildEditorialNav(root, brands, products, brandSlug) {
  const raw = (await readFile(new URL('partials/nav-common.generated.html', root), 'utf8')).replace(/\r\n/g, '\n');
  const pick = name => {
    const a = raw.indexOf(`<!-- ${name} -->`);
    const b = raw.indexOf(`<!-- /${name} -->`);
    if (a < 0 || b < a) throw new Error(`Fragment ${name} introuvable (partials/nav-common.generated.html)`);
    // role="none" sur <li> rompt la sémantique de liste (contrôle d'accessibilité).
    return raw.slice(a + name.length + 9, b).trim().replaceAll(' role="none"', '');
  };
  const live = new Set(products.filter(p => p.category_id === 'parfums').map(p => p.brand_slug));
  const links = ['<a href="/parfums/">Tous les parfums</a>']
    .concat(brands.filter(b => live.has(b.id)).map(b => `<a href="/parfums/${esc(b.id)}/"${b.id === brandSlug ? ' class="active"' : ''}>${esc(b.name)}</a>`))
    .join('\n          ');
  return `<header>
  <div class="row-identity">
    <a href="/" class="brand">
      <img src="/logo-dar-nur.png" alt="Logo Dar Nūr" class="brand-logo" width="56" height="56"/>
      <span class="brand-text"><span class="name">DAR NŪR</span><span class="ar" lang="ar">دار النور</span></span>
    </a>
  </div>
  <div class="row-nav">
  <nav aria-label="Navigation principale">
    <div class="nav-portal">
    <ul class="nav-links" id="navLinks">
${pick('COMMON_NAV_BEFORE_PARFUMS')}
      <li class="nav-item nav-dropdown">
        <button type="button" class="nav-dropdown-title" id="nav-parfums-trigger" aria-haspopup="true" aria-expanded="false" aria-controls="nav-parfums-menu">Parfums</button>
        <div class="nav-dropdown-menu" id="nav-parfums-menu" aria-label="Parfums">
          ${links}
        </div>
      </li>
${pick('COMMON_NAV_AFTER_PARFUMS')}
    </ul>
    </div>
    <button type="button" class="burger" id="burger" aria-label="Menu" aria-expanded="false" aria-controls="navLinks"><span></span><span></span><span></span></button>
  </nav>
  </div>
</header>`;
}
