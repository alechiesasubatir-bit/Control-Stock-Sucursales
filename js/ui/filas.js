// Fila de artículo reutilizada en el buscador y en la lista de artículos.
import { total } from '../catalogo.js';

const escapar = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export { escapar };

function resaltar(texto, consulta) {
  const limpio = escapar(texto);
  const palabras = String(consulta || '').trim().split(/\s+/).filter(p => p.length > 1 && !/^\d+$/.test(p));
  if (!palabras.length) return limpio;
  const sinAc = s => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const base = sinAc(texto);
  const marcas = new Array(texto.length).fill(false);
  for (const p of palabras) {
    const q = sinAc(p);
    let i = base.indexOf(q);
    while (i !== -1) { for (let k = i; k < i + q.length; k++) marcas[k] = true; i = base.indexOf(q, i + q.length); }
  }
  let out = '', abierto = false;
  for (let i = 0; i < texto.length; i++) {
    if (marcas[i] && !abierto) { out += '<mark>'; abierto = true; }
    if (!marcas[i] && abierto) { out += '</mark>'; abierto = false; }
    out += escapar(texto[i]);
  }
  return out + (abierto ? '</mark>' : '');
}

const num = (v, et, activo) =>
  `<span class="fila-num${activo ? ' activo' : ''}${v === null ? ' nulo' : ''}"><b>${v === null ? '—' : v}</b><i>${et}</i></span>`;

export function filaArticulo(a, sector, consulta = '') {
  return `<li><button class="fila" data-cod="${escapar(a.cod)}">
    <span class="fila-cuerpo">
      <span class="fila-titulo">${resaltar(a.desc || a.cod, consulta)}</span>
      <span class="fila-sub"><span class="mono">${escapar(a.cod)}</span></span>
    </span>
    ${a.comentario ? '<span class="fila-coment" aria-hidden="true"></span>' : ''}
    <span class="fila-nums">${num(a.deposito, 'Dep', sector === 'deposito')}${num(a.salon, 'Sal', sector === 'salon')}${num(total(a), 'Tot', false)}</span>
  </button></li>`;
}
