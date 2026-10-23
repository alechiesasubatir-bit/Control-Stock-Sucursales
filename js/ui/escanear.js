// Pantalla principal: sector, botón de escaneo con anillo de avance y buscador.
import { estado, on, emitir, guardarPreferencias, NOMBRES } from '../estado.js';
import { avance, buscarTexto, buscarPorCodigo } from '../catalogo.js';
import { filaArticulo } from './filas.js';

const CIRCUNFERENCIA = 2 * Math.PI * 100;

export function initEscanear({ abrirVisor }) {
  const $ = id => document.getElementById(id);
  const selector = document.querySelector('.sector');
  const buscador = $('buscador');
  const resultados = $('resultados');
  const limpiar = $('buscador-limpiar');
  let completo = false;

  function pintarSector() {
    selector.dataset.sector = estado.sector;
    selector.querySelectorAll('[data-sector]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.sector === estado.sector)));
  }

  function pintarAvance() {
    const { contados, total } = avance(estado.articulos, estado.sector);
    const p = total ? contados / total : 0;
    $('anillo-valor').style.strokeDashoffset = String(CIRCUNFERENCIA * (1 - p));
    $('avance-num').textContent = contados.toLocaleString('es-UY');
    $('avance-total').textContent = total.toLocaleString('es-UY');
    $('avance-sector').textContent = NOMBRES[estado.sector];
    if (total && contados === total && !completo) { completo = true; emitir('completo'); }
    if (contados < total) completo = false;
  }

  function buscar() {
    const q = buscador.value;
    limpiar.hidden = !q;
    if (!q.trim()) { resultados.innerHTML = ''; return; }
    const exacto = /^\d{4,}$/.test(q.trim()) ? buscarPorCodigo(estado.indice, q) : null;
    const lista = exacto ? [exacto] : buscarTexto(estado.articulos, q, 30);
    resultados.innerHTML = lista.length
      ? lista.map(a => filaArticulo(a, estado.sector, q)).join('')
      : `<li class="resultado-vacio">No hay artículos que coincidan con “${q.replace(/[<>&]/g, '')}”.</li>`;
  }

  selector.addEventListener('click', e => {
    const b = e.target.closest('[data-sector]');
    if (!b || b.dataset.sector === estado.sector) return;
    estado.sector = b.dataset.sector;
    guardarPreferencias();
    navigator.vibrate?.(8);
    pintarSector();
    pintarAvance();
    buscar();
    emitir('sector');
  });
  $('boton-escanear').addEventListener('click', () => abrirVisor());
  buscador.addEventListener('input', buscar);
  buscador.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const primero = resultados.querySelector('[data-cod]');
    if (primero) primero.click();
  });
  limpiar.addEventListener('click', () => { buscador.value = ''; buscar(); buscador.focus(); });
  resultados.addEventListener('click', e => {
    const f = e.target.closest('[data-cod]');
    if (f) emitir('abrirFicha', { articulo: estado.porCod.get(f.dataset.cod) });
  });

  on('catalogo', () => { pintarAvance(); buscar(); });
  on('articulo', () => { pintarAvance(); if (buscador.value) buscar(); });

  return {
    mostrar() { pintarSector(); pintarAvance(); buscar(); },
    buscarTexto(texto) { buscador.value = texto; buscar(); buscador.focus(); },
  };
}
