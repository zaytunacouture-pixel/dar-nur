// Onglet « Fournisseurs » de admin.html — synchroniseur fournisseur V1.
// Chargé UNIQUEMENT par admin.html (jamais par le site public) ; dépend de
// js/supabase-client.js (`_supa`, `getSession`) et des utilitaires globaux
// d'admin.html (`esc`, `showToast`, `allProducts`).
//
// Rôle : montrer à l'administrateur, par produit/variante ayant une source
// fournisseur, le prix Dar Nūr, les prix fournisseur (avant / actuel), la
// promo, le stock fournisseur, le mode de stock Dar Nūr, le prix d'achat réel
// et les propositions du synchroniseur ; lui permettre de déclarer les faits
// Dar Nūr (stock_mode, base_price, purchase_price + date + origine) et de
// décider (accepter / refuser + note) chaque proposition.
//
// CE QUE CET ONGLET N'ÉCRIT JAMAIS : products.price_value, product_variants.price,
// products.active, products.coming_soon. Accepter une proposition n'écrit que
// la décision (sync_proposals) ; le prix n'est appliqué que par
// `node scripts/sync-supplier.mjs --apply`, après re-vérification des faits.
// Publier / dépublier / coming_soon restent des gestes de l'onglet Produits.
//
// Vocabulaire imposé : purchase_price NULL = « non renseigné », rentabilité
// « inconnue ». Le prix public fournisseur n'est jamais présenté comme un coût.

const SUPPLY_LEVEL_LABEL = { bloquant: 'Bloquant', attention: 'Attention', info: 'Info' };
const SUPPLY_LEVEL_ORDER = { bloquant: 0, attention: 1, info: 2 };
const SUPPLY_KIND_LABEL = {
  stock_mode_missing: 'Mode de stock à déclarer', base_price_missing: 'Prix de base à déclarer',
  promo_strong: 'Promo forte fournisseur', promo_start: 'Début de promo fournisseur', promo_end: 'Fin de promo fournisseur',
  regular_up: 'Hausse prix fournisseur', regular_down: 'Baisse prix fournisseur',
  dn_below_supplier: 'Prix Dar Nūr < prix fournisseur', dn_below_regular: 'Prix Dar Nūr dépend d’une promo', dn_below_purchase: 'Prix Dar Nūr < prix d’achat',
  supplier_out_of_stock: 'Rupture fournisseur', supplier_back_in_stock: 'De nouveau disponible',
  stale: 'Données périmées', unreachable: 'Fournisseur injoignable',
};
const SUPPLY_TARGET_LABEL = { none: 'action manuelle', product_price: 'prix produit', variant_price: 'prix variante', base_price: 'prix de base' };

let supplyState = { sources: [], supply: [], proposals: [], observations: [], loaded: false, filter: 'all', query: '' };

// ── Lecture ───────────────────────────────────────────────────────────────────

async function supplyFetchAll() {
  const [s, sp, pr, ob] = await Promise.all([
    _supa.from('product_sources').select('*').order('supplier_product_id').order('supplier_variant_id', { nullsFirst: true }),
    _supa.from('product_supply').select('*'),
    _supa.from('sync_proposals').select('*').order('created_at', { ascending: false }),
    _supa.from('product_source_observations').select('source_id,observed_at,regular_price,price,on_sale,in_stock,stock_qty,run_id').order('observed_at', { ascending: false }).limit(5000),
  ]);
  for (const r of [s, sp, pr, ob]) if (r.error) throw r.error;
  supplyState = { ...supplyState, sources: s.data || [], supply: sp.data || [], proposals: pr.data || [], observations: ob.data || [], loaded: true };
}

async function loadSupplySection() {
  const tbody = document.getElementById('supply-tbody');
  tbody.innerHTML = '<tr><td colspan="9" class="loading">Chargement…</td></tr>';
  try {
    await supplyFetchAll();
    renderSupply();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="9" class="loading">Impossible de lire les tables fournisseur : ${esc(e.message)}<br><small>Migration supabase/sql/sync_supplier.sql exécutée ? Compte administrateur ?</small></td></tr>`;
  }
}

// ── Modèle de ligne ───────────────────────────────────────────────────────────

const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const supplyFmt = v => (v == null ? '—' : Number(v).toFixed(2).replace('.', ',') + ' €');
const supplyDate = v => (v ? String(v).slice(0, 10) : '—');

function supplyRows() {
  const rows = [];
  for (const src of supplyState.sources) {
    const product = allProducts.find(p => p.id === src.product_id);
    if (!product) continue;
    const variant = src.variant_id ? (product.product_variants || []).find(v => v.id === src.variant_id) : null;
    const variable = (product.variant_axes || []).length > 0 || (product.product_variants || []).length > 0;
    const priced = variable ? !!variant : true;
    const supplyExact = supplyState.supply.find(x => x.product_id === src.product_id && (x.variant_id || NIL_UUID) === (src.variant_id || NIL_UUID));
    const supplyProduct = supplyState.supply.find(x => x.product_id === src.product_id && !x.variant_id);
    const obs = supplyState.observations.filter(o => o.source_id === src.id);
    const pending = supplyState.proposals.filter(p => p.source_id === src.id && p.status === 'pending').sort((a, b) => SUPPLY_LEVEL_ORDER[a.level] - SUPPLY_LEVEL_ORDER[b.level]);
    rows.push({
      src, product, variant, variable, priced,
      label: variant ? `${product.name} — ${variant.name || ''}` : product.name + (variable ? ' (produit)' : ''),
      status: !product.active ? 'brouillon' : product.coming_soon ? 'actif · bientôt' : 'actif',
      dnPrice: variant ? variant.price : (priced ? product.price_value : null),
      stockMode: supplyProduct?.stock_mode ?? null,
      basePrice: supplyExact?.base_price ?? null,
      previous: obs[1] || null, // avant-dernière observation = « fournisseur avant »
      pending,
      worst: pending.length ? Math.min(...pending.map(p => SUPPLY_LEVEL_ORDER[p.level])) : 9,
    });
  }
  return rows.sort((a, b) => a.worst - b.worst || a.label.localeCompare(b.label, 'fr'));
}

// ── Rendu ─────────────────────────────────────────────────────────────────────

function supplyBadge(level) { return `<span class="badge badge-lvl-${level}">${SUPPLY_LEVEL_LABEL[level] || level}</span>`; }

function renderSupply() {
  const rows = supplyRows().filter(r => {
    if (supplyState.filter === 'alerts' && !r.pending.length) return false;
    if (['bloquant', 'attention', 'info'].includes(supplyState.filter) && !r.pending.some(p => p.level === supplyState.filter)) return false;
    if (supplyState.query && !r.label.toLowerCase().includes(supplyState.query)) return false;
    return true;
  });
  const counts = { bloquant: 0, attention: 0, info: 0 };
  for (const p of supplyState.proposals) if (p.status === 'pending' && counts[p.level] != null) counts[p.level]++;
  document.getElementById('supply-counts').innerHTML =
    `${supplyBadge('bloquant')} ${counts.bloquant} · ${supplyBadge('attention')} ${counts.attention} · ${supplyBadge('info')} ${counts.info}`;
  const lastSync = supplyState.sources.map(s => s.last_synced_at).filter(Boolean).sort().pop();
  const stale = supplyState.sources.filter(s => s.last_error).length;
  document.getElementById('supply-foot').textContent =
    `Dernière observation réussie : ${lastSync ? new Date(lastSync).toLocaleString('fr-FR') : '—'} · sources : ${supplyState.sources.length} · en erreur à la dernière tentative : ${stale}. ` +
    'Les propositions et leurs textes datent de la dernière synchronisation (--record) : une déclaration faite ici est prise en compte au passage suivant. ' +
    'Les prix publics ne sont jamais modifiés ici : une proposition acceptée est appliquée par le synchroniseur (--apply) après re-vérification des faits.';

  const tbody = document.getElementById('supply-tbody');
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="9" class="loading">Aucune source fournisseur.</td></tr>'; return; }
  tbody.innerHTML = rows.map(r => {
    const s = r.src;
    const promo = s.supplier_on_sale ? `<strong>oui</strong><br><small>régulier ${supplyFmt(s.supplier_regular_price)}</small>` : 'non';
    const stockF = s.last_error ? `<span class="badge badge-off">injoignable</span>` : s.supplier_in_stock === false ? `<span class="badge badge-off">rupture</span>` : (s.supplier_stock_qty ?? 'oui');
    const stockDn = !r.variant
      ? `<select class="supply-inl" data-act="stock-mode" data-product="${esc(r.product.id)}">
           <option value=""${r.stockMode == null ? ' selected' : ''}>à déclarer</option>
           <option value="own_stock"${r.stockMode === 'own_stock' ? ' selected' : ''}>stock propre</option>
           <option value="on_demand"${r.stockMode === 'on_demand' ? ' selected' : ''}>à la commande</option>
         </select>`
      : `<small>${r.stockMode === 'own_stock' ? 'stock propre' : r.stockMode === 'on_demand' ? 'à la commande' : 'à déclarer'} (produit)</small>`;
    const basePrice = r.priced
      ? `<div class="supply-base"><small>base</small> <input type="number" step="1" min="1" class="supply-inl supply-num" value="${r.basePrice ?? ''}" placeholder="—" data-act="base-price" data-product="${esc(r.product.id)}" data-variant="${esc(r.variant?.id || '')}" data-supply="${esc(supplyState.supply.find(x => x.product_id === r.product.id && (x.variant_id || NIL_UUID) === (r.variant?.id || NIL_UUID))?.id || '')}"/></div>`
      : '';
    const purchase = s.purchase_price != null
      ? `<button class="btn btn-outline btn-small" data-act="purchase-edit" data-source="${esc(s.id)}" title="${esc(s.purchase_price_origin || '')} · ${supplyDate(s.purchase_price_at)}">${supplyFmt(s.purchase_price)}</button><br><small>${esc(s.purchase_price_origin || '')} · ${supplyDate(s.purchase_price_at)}</small>`
      : `<button class="btn btn-outline btn-small" data-act="purchase-edit" data-source="${esc(s.id)}" title="Prix d’achat non renseigné : rentabilité inconnue">non renseigné</button>`;
    // Colonne Alerte : un badge par proposition, le libellé complet est dans la ligne d'action.
    const alerts = r.pending.length ? r.pending.map(p => `<span class="badge badge-lvl-${p.level}" title="${esc(SUPPLY_KIND_LABEL[p.kind] || p.kind)}">${SUPPLY_LEVEL_LABEL[p.level]}</span>`).join(' ') : '<span class="supply-muted">—</span>';
    // Les propositions occupent une seconde ligne pleine largeur : le tableau
    // reste lisible sans défilement horizontal, l'action est sous le contexte.
    const actions = r.pending.length ? r.pending.map(p => `
      <div class="supply-prop" data-id="${esc(p.id)}">
        <div class="supply-prop-text">${supplyBadge(p.level)} <strong>${esc(SUPPLY_KIND_LABEL[p.kind] || p.kind)}</strong> — ${esc(p.suggested_action)}</div>
        <div class="supply-prop-meta"><small>cible : ${SUPPLY_TARGET_LABEL[p.target] || esc(p.target)}${p.suggested_value != null ? ` · suggestion ${supplyFmt(p.suggested_value)}` : ''} · ${supplyDate(p.created_at)}</small></div>
        <div class="supply-prop-form">
          ${p.target !== 'none' ? `<input type="number" step="1" min="1" class="supply-inl supply-num" value="${p.suggested_value ?? ''}" placeholder="valeur €" data-role="value"/>` : ''}
          <input type="text" class="supply-inl supply-note" placeholder="note de décision" data-role="note"/>
          <button class="btn btn-primary btn-small supply-btn" data-act="decide" data-decision="accepted" data-id="${esc(p.id)}">Accepter</button>
          <button class="btn btn-outline btn-small" data-act="decide" data-decision="rejected" data-id="${esc(p.id)}">Refuser</button>
        </div>
      </div>`).join('') : '<span class="supply-muted">—</span>';
    return `<tr class="supply-row-${r.pending[0]?.level || 'none'}">
      <td><strong>${esc(r.label)}</strong><br><small>${esc(r.status)}</small> · <a href="#" class="supply-link" data-act="history" data-source="${esc(s.id)}">historique</a></td>
      <td>${supplyFmt(r.dnPrice)}${basePrice}</td>
      <td title="${r.previous ? 'observé le ' + supplyDate(r.previous.observed_at) : ''}">${r.previous ? supplyFmt(r.previous.price) : '—'}</td>
      <td title="observé le ${supplyDate(s.last_synced_at)}">${supplyFmt(s.supplier_price)}</td>
      <td>${promo}</td>
      <td>${stockF}</td>
      <td>${stockDn}</td>
      <td>${purchase}</td>
      <td>${alerts}</td>
    </tr>${r.pending.length ? `<tr class="supply-actions-row supply-row-${r.pending[0].level}"><td colspan="9"><div class="supply-actions"><small class="supply-muted">Action proposée</small>${actions}</div></td></tr>` : ''}`;
  }).join('');
}

function filterSupply() {
  supplyState.filter = document.getElementById('supply-filter').value;
  supplyState.query = document.getElementById('supply-search').value.trim().toLowerCase();
  renderSupply();
}

// ── Écritures (faits Dar Nūr et décisions uniquement) ─────────────────────────

async function supplySaveStockMode(productId, value) {
  const existing = supplyState.supply.find(x => x.product_id === productId && !x.variant_id);
  const stock_mode = value || null;
  const r = existing
    ? await _supa.from('product_supply').update({ stock_mode }).eq('id', existing.id).select().single()
    : await _supa.from('product_supply').insert({ product_id: productId, variant_id: null, stock_mode }).select().single();
  if (r.error) throw r.error;
}

async function supplySaveBasePrice(productId, variantId, supplyId, raw) {
  const base_price = raw === '' ? null : Number(raw);
  if (base_price != null && (!(base_price > 0) || !Number.isInteger(base_price))) throw new Error('Le prix de base est un nombre entier d’euros.');
  const r = supplyId
    ? await _supa.from('product_supply').update({ base_price }).eq('id', supplyId).select().single()
    : await _supa.from('product_supply').insert({ product_id: productId, variant_id: variantId || null, base_price }).select().single();
  if (r.error) throw r.error;
}

async function supplySavePurchase(sourceId, { price, at, origin }) {
  // La date saisie (jour) est stockée à midi UTC : son jour reste le même quel
  // que soit le fuseau qui la relit (affichage = 10 premiers caractères ISO).
  const patch = price == null
    ? { purchase_price: null, purchase_price_at: null, purchase_price_origin: null }
    : { purchase_price: price, purchase_price_at: `${at}T12:00:00Z`, purchase_price_origin: origin };
  const r = await _supa.from('product_sources').update(patch).eq('id', sourceId).select().single();
  if (r.error) throw r.error;
}

async function supplyDecide(id, decision, value, note) {
  const session = await getSession();
  if (!session) throw new Error('Session expirée.');
  const p = supplyState.proposals.find(x => x.id === id);
  if (!p || p.status !== 'pending') throw new Error('Cette proposition n’est plus en attente (rechargez).');
  const patch = { status: decision, decided_at: new Date().toISOString(), decided_by: session.user.id, decision_note: note || null, decided_value: null };
  if (decision === 'accepted' && p.target !== 'none') {
    const v = Number(value);
    if (!(v > 0) || !Number.isInteger(v)) throw new Error('Indiquez la valeur retenue, en euros entiers.');
    patch.decided_value = v;
  }
  const r = await _supa.from('sync_proposals').update(patch).eq('id', id).eq('status', 'pending').select();
  if (r.error) throw r.error;
  if (!r.data || !r.data.length) throw new Error('Proposition déjà décidée ou obsolète (rechargez).');
}

// ── Historique ────────────────────────────────────────────────────────────────

function openSupplyHistory(sourceId) {
  const src = supplyState.sources.find(s => s.id === sourceId);
  if (!src) return;
  const row = supplyRows().find(r => r.src.id === sourceId);
  const obs = supplyState.observations.filter(o => o.source_id === sourceId);
  const props = supplyState.proposals.filter(p => p.source_id === sourceId);
  document.getElementById('supply-history-title').textContent = `Historique — ${row ? row.label : ''}`;
  const obsHtml = obs.length ? `<table><thead><tr><th>Date</th><th>Régulier</th><th>Effectif</th><th>Promo</th><th>Dispo</th><th>Qté</th></tr></thead><tbody>` +
    obs.map(o => `<tr><td>${new Date(o.observed_at).toLocaleString('fr-FR')}</td><td>${supplyFmt(o.regular_price)}</td><td>${supplyFmt(o.price)}</td><td>${o.on_sale ? 'oui' : 'non'}</td><td>${o.in_stock ? 'oui' : 'rupture'}</td><td>${o.stock_qty ?? '—'}</td></tr>`).join('') + '</tbody></table>'
    : '<p class="supply-muted">Aucune observation enregistrée (le synchroniseur n’a pas encore tourné en mode --record).</p>';
  const propHtml = props.length ? `<table><thead><tr><th>Date</th><th>Type</th><th>Niveau</th><th>Statut</th><th>Décision</th></tr></thead><tbody>` +
    props.map(p => `<tr><td>${supplyDate(p.created_at)}</td><td>${esc(SUPPLY_KIND_LABEL[p.kind] || p.kind)}<br><small>${esc(p.suggested_action)}</small></td><td>${supplyBadge(p.level)}</td><td>${esc(p.status)}${p.applied_at ? '<br><small>appliquée ' + supplyDate(p.applied_at) + '</small>' : ''}${p.obsolete_reason ? '<br><small>' + esc(p.obsolete_reason) + '</small>' : ''}</td>` +
      `<td>${p.decided_at ? `${supplyDate(p.decided_at)}${p.decided_value != null ? ' · ' + supplyFmt(p.decided_value) : ''}${p.decision_note ? '<br><small>' + esc(p.decision_note) + '</small>' : ''}` : '—'}</td></tr>`).join('') + '</tbody></table>'
    : '<p class="supply-muted">Aucune proposition.</p>';
  document.getElementById('supply-history-body').innerHTML =
    `<p><small>Fournisseur : dernière tentative ${src.last_attempt_at ? new Date(src.last_attempt_at).toLocaleString('fr-FR') : '—'}${src.last_error ? ' — erreur : ' + esc(src.last_error) : ''} · SKU ${esc(src.supplier_sku || '—')}</small></p>` +
    `<h3>Observations fournisseur</h3>${obsHtml}<h3>Propositions et décisions</h3>${propHtml}`;
  document.getElementById('supply-history-modal').classList.add('open');
}
function closeSupplyHistory() { document.getElementById('supply-history-modal').classList.remove('open'); }

function openSupplyPurchase(sourceId) {
  const src = supplyState.sources.find(s => s.id === sourceId);
  if (!src) return;
  const row = supplyRows().find(r => r.src.id === sourceId);
  document.getElementById('supply-purchase-title').textContent = `Prix d’achat réel — ${row ? row.label : ''}`;
  document.getElementById('supply-purchase-source').value = sourceId;
  document.getElementById('supply-purchase-price').value = src.purchase_price ?? '';
  document.getElementById('supply-purchase-at').value = src.purchase_price_at ? String(src.purchase_price_at).slice(0, 10) : '';
  document.getElementById('supply-purchase-origin').value = src.purchase_price_origin || 'facture';
  document.getElementById('supply-purchase-modal').classList.add('open');
}
function closeSupplyPurchase() { document.getElementById('supply-purchase-modal').classList.remove('open'); }

async function saveSupplyPurchase(clear) {
  const sourceId = document.getElementById('supply-purchase-source').value;
  try {
    if (clear) {
      await supplySavePurchase(sourceId, { price: null });
    } else {
      const price = Number(document.getElementById('supply-purchase-price').value);
      const at = document.getElementById('supply-purchase-at').value;
      const origin = document.getElementById('supply-purchase-origin').value;
      if (!(price > 0)) throw new Error('Prix d’achat invalide.');
      if (!at) throw new Error('La date du prix d’achat est obligatoire.');
      await supplySavePurchase(sourceId, { price, at, origin });
    }
    closeSupplyPurchase();
    showToast('Prix d’achat enregistré', 'ok');
    await loadSupplySection();
  } catch (e) { showToast('Erreur : ' + e.message, 'err'); }
}

// ── Événements (délégation, valeurs lues via dataset) ─────────────────────────

document.addEventListener('change', async (e) => {
  const el = e.target.closest('[data-act="stock-mode"], [data-act="base-price"]');
  if (!el) return;
  try {
    if (el.dataset.act === 'stock-mode') await supplySaveStockMode(el.dataset.product, el.value);
    else await supplySaveBasePrice(el.dataset.product, el.dataset.variant, el.dataset.supply, el.value.trim());
    showToast('Enregistré', 'ok');
    await loadSupplySection();
  } catch (err) { showToast('Erreur : ' + err.message, 'err'); await loadSupplySection(); }
});

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act="decide"], [data-act="history"], [data-act="purchase-edit"]');
  if (!btn) return;
  if (btn.dataset.act === 'history') { e.preventDefault(); return openSupplyHistory(btn.dataset.source); }
  if (btn.dataset.act === 'purchase-edit') return openSupplyPurchase(btn.dataset.source);
  const box = btn.closest('.supply-prop');
  const value = box.querySelector('[data-role="value"]')?.value;
  const note = box.querySelector('[data-role="note"]')?.value.trim();
  btn.disabled = true;
  try {
    await supplyDecide(btn.dataset.id, btn.dataset.decision, value, note);
    showToast(btn.dataset.decision === 'accepted' ? 'Proposition acceptée — sera appliquée par le synchroniseur (--apply)' : 'Proposition refusée', 'ok');
    await loadSupplySection();
  } catch (err) { btn.disabled = false; showToast('Erreur : ' + err.message, 'err'); }
});
