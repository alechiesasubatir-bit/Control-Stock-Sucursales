// Lista completa de artículos con filtros. Se dibuja de a tramos para que 2.000 filas no traben.
import { estado, on, emitir } from '../estado.js';
import { filtrar, buscarTexto, avance } from '../catalogo.js';
import { filaArticulo } from './filas.js';

const TRAMO = 60;

export function initArticulos() {
  const $ = id => document.getElementById(id);
  const lista = $('lista-articulos');
  const buscador = $('buscador-articulos');
  let filtro = 'todos';
  let datos = [];
  let dibujados = 0;
  let visible = false;

  function kpis() {
    $('kpi-deposito').textContent = avance(estado.articulos, 'deposito').contados.toLocaleString('es-UY');
    $('kpi-salon').textContent = avance(estado.articulos, 'salon').contados.toLocaleString('es-UY');
    $('kpi-coment').textContent = filtrar(estado.articulos, 'comentados').length.toLocaleString('es-UY');
  }

  function mas() {
    if (!visible || dibujados >= datos.length) return;
    const tramo = datos.slice(dibujados, dibujados + TRAMO);
    lista.insertAdjacentHTML('beforeend', tramo.map(a => filaArticulo(a, estado.sector, buscador.value)).join(''));
    dibujados += tramo.length;
  }

  function pintar() {
    const q = buscador.value.trim();
    const base = filtrar(estado.articulos, filtro, estado.sector);
    datos = q ? buscarTexto(base, q, Infinity) : base;
    $('articulos-cuenta').textContent = `${datos.length.toLocaleString('es-UY')} artículo${datos.length === 1 ? '' : 's'}`;
    lista.innerHTML = '';
    dibujados = 0;
    mas();
    kpis();
  }

  new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) mas(); }, { rootMargin: '600px' })
    .observe($('articulos-centinela'));

  document.querySelector('[data-p="articulos"] .chips').addEventListener('click', e => {
    const b = e.target.closest('[data-filtro]');
    if (!b) return;
    filtro = b.dataset.filtro;
    b.parentElement.querySelectorAll('[data-filtro]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    pintar();
  });
  buscador.addEventListener('input', pintar);
  lista.addEventListener('click', e => {
    const f = e.target.closest('[data-cod]');
    if (f) emitir('abrirFicha', { articulo: estado.porCod.get(f.dataset.cod) });
  });

  // Un artículo que cambió se redibuja en su lugar, sin perder el scroll.
  on('articulo', a => {
    if (!visible || !a) return;
    const viejo = lista.querySelector(`[data-cod="${CSS.escape(a.cod)}"]`);
    if (viejo) {
      const t = document.createElement('template');
      t.innerHTML = filaArticulo(a, estado.sector, buscador.value);
      viejo.closest('li').replaceWith(t.content.firstElementChild);
    }
    kpis();
  });
  on('catalogo', () => { if (visible) pintar(); });
  on('sector', () => { if (visible) pintar(); });

  return {
    mostrar() { visible = true; pintar(); },
    ocultar() { visible = false; },
  };
}
