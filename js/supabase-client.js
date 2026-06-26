// Client Supabase — Dar Nūr
// Dépend de js/config.js (chargé avant dans le HTML)

const _supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ── Auth ──────────────────────────────────────────────────────────────────────

async function signIn(email, password) {
  const { data, error } = await _supa.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

async function signOut() {
  await _supa.auth.signOut();
}

async function getSession() {
  const { data } = await _supa.auth.getSession();
  return data.session;
}

// ── Produits (lecture publique) ───────────────────────────────────────────────

async function fetchProducts({ categoryId, activeOnly = true } = {}) {
  let q = _supa.from('products').select('*, product_variants(*)').order('sort_order');
  if (activeOnly) q = q.eq('active', true);
  if (categoryId)  q = q.eq('category_id', categoryId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

async function fetchProduct(slug) {
  const { data, error } = await _supa
    .from('products')
    .select('*, product_variants(*)')
    .eq('slug', slug)
    .single();
  if (error) throw error;
  return data;
}

async function fetchCategories() {
  const { data, error } = await _supa
    .from('categories')
    .select('*')
    .eq('active', true)
    .order('sort_order');
  if (error) throw error;
  return data;
}

async function fetchAllCategories() {
  const { data, error } = await _supa
    .from('categories')
    .select('*')
    .order('sort_order');
  if (error) throw error;
  return data;
}

async function saveCategory(cat) {
  const { data, error } = await _supa
    .from('categories')
    .upsert(cat, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteCategory(id) {
  const { error } = await _supa.from('categories').delete().eq('id', id);
  if (error) throw error;
}

// ── Produits (écriture admin — nécessite session authentifiée) ─────────────────

async function saveProduct(product) {
  const { id, product_variants: _v, ...fields } = product;
  if (id) {
    const { data, error } = await _supa.from('products').update(fields).eq('id', id).select().single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await _supa.from('products').insert(fields).select().single();
    if (error) throw error;
    return data;
  }
}

async function deleteProduct(id) {
  const { error } = await _supa.from('products').delete().eq('id', id);
  if (error) throw error;
}

async function toggleProductActive(id, active) {
  const { data, error } = await _supa
    .from('products').update({ active }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// ── Variantes ─────────────────────────────────────────────────────────────────

async function saveVariant(variant) {
  const { id, ...fields } = variant;
  if (id) {
    const { data, error } = await _supa.from('product_variants').update(fields).eq('id', id).select().single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await _supa.from('product_variants').insert(fields).select().single();
    if (error) throw error;
    return data;
  }
}

async function deleteVariant(id) {
  const { error } = await _supa.from('product_variants').delete().eq('id', id);
  if (error) throw error;
}

// ── Offres (lecture publique) ─────────────────────────────────────────────────

async function fetchActiveOffers() {
  const { data, error } = await _supa
    .from('offers')
    .select('*, offer_products(*)')
    .eq('active', true)
    .order('sort_order');
  if (error) throw error;
  // Filtrage côté client pour la fenêtre de dates (RLS filtre déjà pour anon)
  const now = new Date();
  return (data || []).filter(o => {
    const started    = !o.starts_at || new Date(o.starts_at) <= now;
    const notExpired = !o.ends_at   || new Date(o.ends_at)   >  now;
    return started && notExpired;
  });
}

// ── Offres (écriture admin) ───────────────────────────────────────────────────

async function fetchOffers() {
  const { data, error } = await _supa
    .from('offers')
    .select('*, offer_products(*)')
    .order('sort_order');
  if (error) throw error;
  return data;
}

async function saveOffer(offer) {
  const { id, offer_products: _op, ...fields } = offer;
  if (id) {
    const { data, error } = await _supa.from('offers').update(fields).eq('id', id).select().single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await _supa.from('offers').insert(fields).select().single();
    if (error) throw error;
    return data;
  }
}

async function deleteOffer(id) {
  const { error } = await _supa.from('offers').delete().eq('id', id);
  if (error) throw error;
}

async function toggleOfferActive(id, active) {
  const { data, error } = await _supa
    .from('offers').update({ active }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function saveOfferProducts(offerId, slugs) {
  const { error: delErr } = await _supa.from('offer_products').delete().eq('offer_id', offerId);
  if (delErr) throw delErr;
  if (!slugs.length) return;
  const rows = slugs.map((slug, i) => ({ offer_id: offerId, product_slug: slug.trim(), sort_order: i }));
  const { error } = await _supa.from('offer_products').insert(rows);
  if (error) throw error;
}

// ── Storage photos ────────────────────────────────────────────────────────────

async function uploadImage(file, path) {
  const { data, error } = await _supa.storage
    .from('product-images')
    .upload(path, file, { upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = _supa.storage.from('product-images').getPublicUrl(path);
  return publicUrl;
}
