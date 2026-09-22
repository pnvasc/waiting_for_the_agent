/* ===========================================================================
   Minimal SVG helpers.

   The diagrams are meant to look drawn with a pen: hairlines, no fills except
   noteheads and dots, no rounded corners, no shadows. Colour comes from the
   CSS classes defined in deck.css (.rule, .stroke, .fill, .mark), never from
   an attribute here, so the night variant works with no code involved.
   =========================================================================== */

const NS = 'http://www.w3.org/2000/svg';

export function svg(viewBox) {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', viewBox);
  el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return el;
}

export function el(name, attrs = {}, parent = null) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    node.setAttribute(k === 'className' ? 'class' : k, v);
  }
  if (parent) parent.appendChild(node);
  return node;
}

export function line(parent, x1, y1, x2, y2, className = 'rule') {
  return el('line', { x1, y1, x2, y2, class: className }, parent);
}

export function text(parent, x, y, str, attrs = {}) {
  const node = el('text', { x, y, ...attrs }, parent);
  node.textContent = str;
  return node;
}

/* Shows a visible, honest empty state instead of a silently blank box. */
export function awaiting(container, message = 'awaiting data') {
  container.innerHTML = '';
  const note = document.createElement('div');
  note.className = 'awaiting';
  note.textContent = message;
  container.appendChild(note);
}
