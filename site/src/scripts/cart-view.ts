/**
 * Rendu des lignes du panier (tiroir, page /panier/, récapitulatif de /commande/).
 * Construction DOM par createElement + textContent : aucune chaîne n'est interprétée comme
 * du HTML (un nom de produit ne peut rien injecter). Styles : classes globales dn-cartline
 * (src/styles/base.css, section « Panier »).
 */
import { formatCents } from '@/lib/orders/labels';
import { lineKey, MAX_QUANTITY, removeLine, setQuantity, type CartLine } from './cart-store';

type Attrs = Record<string, string | boolean | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (name === 'class') el.className = String(value);
    else el.setAttribute(name, value === true ? '' : value);
  }
  for (const child of children) if (child) el.append(child);
  return el;
}

/** Icône déjà rendue au build dans un <template id="dn-icon-…"> (jeu Lucide fermé). */
export function icon(name: string): Node | null {
  const template = document.getElementById(`dn-icon-${name}`) as HTMLTemplateElement | null;
  return template ? template.content.cloneNode(true) : null;
}

export interface LineNotice {
  text: string;
  tone: 'warning' | 'error' | 'info';
}

export interface RenderOptions {
  editable: boolean;
  /** Messages par ligne (prix changé, indisponible…), clé = lineKey. */
  notices?: Map<string, LineNotice>;
}

/** Contrôle à refocaliser après un nouveau rendu (les boutons +/− sont recréés). */
let pendingFocus: { key: string; action: string } | null = null;

export function renderLines(list: HTMLElement, lines: CartLine[], options: RenderOptions): void {
  list.replaceChildren(
    ...lines.map((line) => {
      const key = lineKey(line);
      const notice = options.notices?.get(key);
      const label = line.variant ? `${line.name} (${line.variant})` : line.name;
      const price = h(
        'p',
        { class: 'dn-cartline__unit dn-small dn-muted' },
        line.listPriceCents ? h('s', {}, formatCents(line.listPriceCents)) : null,
        line.listPriceCents ? ' ' : null,
        `${formatCents(line.unitPriceCents)} l’unité`,
      );
      const quantity = options.editable
        ? h(
            'div',
            { class: 'dn-qty', role: 'group', 'aria-label': `Quantité de ${label}` },
            qtyButton(key, 'minus', `Diminuer la quantité de ${label}`, line.quantity <= 1, () =>
              setQuantity(key, line.quantity - 1),
            ),
            h('span', { class: 'dn-qty__value' }, String(line.quantity)),
            qtyButton(key, 'plus', `Augmenter la quantité de ${label}`, line.quantity >= MAX_QUANTITY, () =>
              setQuantity(key, line.quantity + 1),
            ),
          )
        : h('p', { class: 'dn-small' }, `Quantité : ${line.quantity}`);
      const remove = options.editable
        ? h(
            'button',
            { type: 'button', class: 'dn-cartline__remove', 'aria-label': `Retirer ${label} du panier` },
            'Retirer',
          )
        : null;
      remove?.addEventListener('click', () => removeLine(key));
      return h(
        'li',
        { class: `dn-cartline${notice?.tone === 'error' ? ' is-invalid' : ''}`, 'data-key': key },
        line.image
          ? h('img', {
              class: 'dn-cartline__thumb',
              src: line.image,
              alt: '',
              width: '64',
              height: '80',
              loading: 'lazy',
            })
          : h('span', { class: 'dn-cartline__thumb', 'aria-hidden': 'true' }),
        h(
          'div',
          { class: 'dn-cartline__info' },
          h('a', { class: 'dn-cartline__name', href: line.href }, line.name),
          line.variant ? h('p', { class: 'dn-small dn-muted' }, line.variant) : null,
          price,
          line.onDemand
            ? h('p', { class: 'dn-small dn-cartline__ondemand' }, 'Sur commande : disponibilité à confirmer')
            : null,
          notice
            ? h('p', { class: `dn-small dn-cartline__notice is-${notice.tone}`, role: 'status' }, notice.text)
            : null,
          h(
            'div',
            { class: 'dn-cartline__row' },
            quantity,
            h('span', { class: 'dn-cartline__total' }, formatCents(line.unitPriceCents * line.quantity)),
          ),
          remove,
        ),
      );
    }),
  );
  if (pendingFocus) {
    const { key, action } = pendingFocus;
    pendingFocus = null;
    const row = [...list.querySelectorAll<HTMLElement>('[data-key]')].find((el) => el.dataset['key'] === key);
    const target = row?.querySelector<HTMLButtonElement>(`[data-action="${action}"]:not(:disabled)`);
    // Bouton devenu inactif (quantité 1 ou plafond) : focus sur l'autre bouton de quantité.
    (target ?? row?.querySelector<HTMLButtonElement>('.dn-qty__btn:not(:disabled)'))?.focus();
  }
}

function qtyButton(key: string, name: string, label: string, disabled: boolean, onClick: () => void) {
  const button = h(
    'button',
    { type: 'button', class: 'dn-qty__btn', 'aria-label': label, 'data-action': name, disabled },
    icon(name),
  );
  button.addEventListener('click', () => {
    pendingFocus = { key, action: name };
    onClick();
  });
  return button;
}
