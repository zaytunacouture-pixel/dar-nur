// ═══════════════════════════════════════════════════════════════════════════════
// Audit des Packs — Dar Nūr
//
// À exécuter dans la console du navigateur sur dar-nur.fr (ADMIN):
// 1. Ouvrir dar-nur.fr/admin.html
// 2. Se connecter en tant qu'admin
// 3. Ouvrir la console (F12)
// 4. Copier-coller ce script
// 5. Examiner les résultats dans la console
// ═══════════════════════════════════════════════════════════════════════════════

(async function auditPacks() {
  console.log('🔍 Audit des variantes et packs...\n');

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Audit : Variantes réelles des produits
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('📊 VARIANTES RÉELLES PAR CATÉGORIE\n');

  // Miels et leurs variantes
  const miels = await _supa
    .from('products')
    .select('id, slug, name, variant_axes, product_variants(id, name, options, price)')
    .eq('category_id', 'miels')
    .eq('active', true);

  console.log('🍯 MIELS :');
  miels.data.forEach(p => {
    console.log(`  • ${p.slug} (${p.name})`);
    if (p.product_variants && p.product_variants.length > 0) {
      p.product_variants.forEach(v => {
        console.log(`    - ${v.name || 'sans nom'}: ${JSON.stringify(v.options)} @ ${v.price}€`);
      });
    } else {
      console.log(`    ⚠️  Pas de variantes`);
    }
  });

  // Huiles et leurs variantes
  const huiles = await _supa
    .from('products')
    .select('id, slug, name, variant_axes, product_variants(id, name, options, price)')
    .eq('category_id', 'huiles')
    .eq('active', true);

  console.log('\n🧴 HUILES :');
  huiles.data.forEach(p => {
    console.log(`  • ${p.slug} (${p.name})`);
    if (p.product_variants && p.product_variants.length > 0) {
      p.product_variants.forEach(v => {
        console.log(`    - ${v.name || 'sans nom'}: ${JSON.stringify(v.options)} @ ${v.price}€`);
      });
    } else {
      console.log(`    ⚠️  Pas de variantes`);
    }
  });

  // Gélules et leurs variantes
  const gelules = await _supa
    .from('products')
    .select('id, slug, name, variant_axes, product_variants(id, name, options, price)')
    .eq('category_id', 'gelules')
    .eq('active', true);

  console.log('\n💊 GÉLULES :');
  gelules.data.forEach(p => {
    console.log(`  • ${p.slug} (${p.name})`);
    if (p.product_variants && p.product_variants.length > 0) {
      p.product_variants.forEach(v => {
        console.log(`    - ${v.name || 'sans nom'}: ${JSON.stringify(v.options)} @ ${v.price}€`);
      });
    } else {
      console.log(`    ⚠️  Pas de variantes`);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Audit : Offres actuelles et produits
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n\n📋 OFFRES ACTUELLES ET LEURS PRODUITS\n');

  const offers = await _supa
    .from('offers')
    .select('id, title, type, normal_price, promo_price, badge, offer_products(product_slug)')
    .order('sort_order');

  offers.data.forEach(o => {
    console.log(`\n🎁 ${o.title} (type: ${o.type})`);
    console.log(`   ID: ${o.id}`);
    console.log(`   normal_price: ${o.normal_price}€, promo_price: ${o.promo_price}€`);
    console.log(`   badge: "${o.badge}"`);

    if (o.offer_products && o.offer_products.length > 0) {
      console.log(`   Produits:`);
      o.offer_products.forEach(op => {
        console.log(`     - ${op.product_slug}`);
      });
    } else {
      console.log(`   ⚠️  AUCUN PRODUIT`);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Aide : Calculs de prix pack
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n\n💰 CALCULS DE PRIX PACK (AIDE)\n');

  // Supposons Pack Sport avec : miel-nigelle, miel-gingembre-curcuma, huile-nigelle, huile-olive, gelules-spiruline
  const packProducts = ['miel-nigelle', 'miel-gingembre-curcuma', 'huile-nigelle', 'huile-olive', 'gelules-spiruline'];

  console.log('Simulation Pack Sport avec ces produits :');
  let totalActuel = 0; // prix avec variantes 50g/10ml
  let total200g = 0;   // prix avec variantes 200g/60ml (hypothèse)

  for (const slug of packProducts) {
    const p = await _supa
      .from('products')
      .select('name, price_value, product_variants(name, price)')
      .eq('slug', slug)
      .single();

    if (p.data) {
      const prodName = p.data.name;
      const variants = p.data.product_variants || [];

      // Prix le moins cher (1ère variante supposée 50g/10ml)
      const prixMin = variants.length > 0
        ? Math.min(...variants.map(v => parseFloat(v.price) || p.data.price_value))
        : p.data.price_value;

      // Prix variante 200g/60ml (2e variante supposée)
      const prix200g = variants.length > 1
        ? parseFloat(variants[1].price) || prixMin
        : prixMin;

      console.log(`  • ${prodName} : ${prixMin}€ (min) → ${prix200g}€ (200g)`);
      totalActuel += prixMin;
      total200g += prix200g;
    }
  }

  console.log(`\nTotaux :`);
  console.log(`  • Avec variantes 50g/10ml : ${totalActuel.toFixed(2)}€`);
  console.log(`  • Avec variantes 200g/60ml : ${total200g.toFixed(2)}€`);
  console.log(`  • Prix pack affiché : 80€`);
  console.log(`  • Économie (50g) : ${(80 - totalActuel).toFixed(2)}€ ${80 - totalActuel < 0 ? '❌ NÉGATIVE' : '✅'}`);
  console.log(`  • Économie (200g) : ${(80 - total200g).toFixed(2)}€ ${80 - total200g < 0 ? '❌ NÉGATIVE' : '✅'}`);

  console.log('\n✅ Audit terminé. Vérifiez les résultats ci-dessus.\n');
})();
