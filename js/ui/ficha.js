// Ficha del artículo: hoja inferior con teclado para sumar, corregir o comentar.
import { estado, on, emitir, registrarCarga, guardarPreferencias, NOMBRES } from '../estado.js';
import { total } from '../catalogo.js';

const MAXIMO = 99999;
const menosMovimiento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = v => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-UY'));

export function initFicha({ reabrirVisor }) {
  const $ = id => document.getElementById(id);
  const hoja = $('ficha');
  const fondo = $('ficha-fondo');
  const okBtn = $('ficha-ok');
  const textarea = $('ficha-textarea');
  let art = null;
  let modo = 'sumar';
  let n = '';
  let desdeVisor = false;
  let ocupado = false;

  const valorN = () => Number(n || 0);
  const nombreSector = () => NOMBRES[estado.sector];

  function pintarNumeros(animarSector = false, desde = null) {
    for (const s of ['deposito', 'salon']) {
      const caja = hoja.querySelector(`[data-n="${s}"]`);
      caja.classList.toggle('activo', s === estado.sector);
      const v = caja.querySelector('.numero-v');
      if (animarSector && s === estado.sector) contar(v, desde ?? 0, art[s] ?? 0, art[s] === null);
      else v.textContent = fmt(art[s]);
    }
    hoja.querySelector('[data-n="total"] .numero-v').textContent = fmt(total(art));
    const c = $('ficha-comentario');
    c.hidden = !art.comentario;
    c.textContent = art.comentario ? '💬 ' + art.comentario : '';
  }

  function contar(el, desde, hasta, vacio) {
    const caja = el.closest('.numero');
    caja.classList.remove('salto'); void caja.offsetWidth; caja.classList.add('salto');
    if (vacio) { el.textContent = '—'; return; }
    if (menosMovimiento() || desde === hasta) { el.textContent = fmt(hasta); return; }
    const t0 = performance.now();
    const paso = t => {
      const p = Math.min(1, (t - t0) / 500);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(desde + (hasta - desde) * e));
      if (p < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }

  function pintarModo() {
    hoja.querySelectorAll('[data-modo]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.modo === modo)));
    $('ficha-cantidad').hidden = modo === 'comentar';
    $('ficha-texto').hidden = modo !== 'comentar';
    const aviso = $('ficha-aviso');
    aviso.hidden = modo !== 'corregir';
    aviso.querySelector('b').textContent = nombreSector();
    pintarN();
  }

  function pintarN() {
    $('ficha-n').textContent = valorN().toLocaleString('es-UY');
    if (modo === 'sumar') {
      okBtn.disabled = valorN() === 0;
      okBtn.textContent = valorN() ? `Sumar ${valorN().toLocaleString('es-UY')} a ${nombreSector()}` : 'Escribí la cantidad';
    } else if (modo === 'corregir') {
      okBtn.disabled = false;
      okBtn.textContent = `Dejar ${nombreSector()} en ${valorN().toLocaleString('es-UY')}`;
    } else {
      okBtn.disabled = textarea.value.trim() === (art?.comentario || '');
      okBtn.textContent = textarea.value.trim() ? 'Guardar comentario' : 'Borrar comentario';
    }
  }

  function setModo(m) {
    modo = m;
    if (m === 'corregir') n = String(art[estado.sector] ?? 0);
    if (m === 'sumar') n = '';
    if (m === 'comentar') { textarea.value = art.comentario || ''; setTimeout(() => textarea.focus(), 50); }
    pintarModo();
  }

  function tecla(t) {
    if (ocupado || modo === 'comentar') return;
    if (t === 'limpiar') n = '';
    else if (t === 'borrar') n = n.slice(0, -1);
    else if (/^\d$/.test(t)) { const s = (n === '0' ? '' : n) + t; if (Number(s) <= MAXIMO) n = s; }
    pintarN();
  }

  function abrir({ articulo, desdeVisor: dv = false }) {
    if (!articulo) return;
    art = articulo;
    desdeVisor = dv;
    ocupado = false;
    $('ficha-desc').textContent = art.desc || art.cod;
    $('ficha-cod').textContent = art.cod;
    $('ficha-precio').textContent = art.precio != null ? '$ ' + art.precio.toLocaleString('es-UY') : '';
    $('ficha-codigos').textContent = art.codigos.filter(c => c !== art.cod).join(' · ');
    hoja.classList.remove('cerrando');
    hoja.style.transform = '';
    fondo.hidden = false;
    hoja.hidden = false;
    hoja.scrollTop = 0;
    document.body.style.overflow = 'hidden';
    setModo('sumar');
    pintarNumeros();
    navigator.vibrate?.(8);
  }

  function cerrar({ seguir = false } = {}) {
    if (hoja.hidden) return;
    hoja.classList.add('cerrando');
    fondo.hidden = true;
    document.body.style.overflow = '';
    setTimeout(() => {
      hoja.hidden = true;
      hoja.classList.remove('cerrando');
      hoja.style.transform = '';
      art = null;
      if (seguir && desdeVisor) reabrirVisor();
    }, menosMovimiento() ? 0 : 260);
  }

  function confirmar() {
    if (ocupado || okBtn.disabled || !art) return;
    const sector = estado.sector;
    const antes = art[sector];
    if (modo === 'sumar') registrarCarga({ accion: 'sumar', sector, cod: art.cod, cantidad: valorN() });
    else if (modo === 'corregir') registrarCarga({ accion: 'corregir', sector, cod: art.cod, valor: valorN() });
    else registrarCarga({ accion: 'comentar', cod: art.cod, texto: textarea.value.trim() });
    ocupado = true;
    okBtn.disabled = true;
    navigator.vibrate?.([12, 40, 24]);
    pintarNumeros(modo !== 'comentar', antes ?? 0);
    const tilde = $('tilde');
    tilde.classList.remove('ver'); void tilde.getBoundingClientRect(); tilde.classList.add('ver');
    setTimeout(() => {
      tilde.classList.remove('ver');
      cerrar({ seguir: true });
    }, menosMovimiento() ? 450 : 900);
  }

  // ── Eventos ──
  $('teclado').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) tecla(b.dataset.t || b.textContent.trim());
  });
  hoja.querySelectorAll('.paso').forEach(b => b.addEventListener('click', () => {
    if (ocupado) return;
    n = String(Math.min(MAXIMO, Math.max(0, valorN() + Number(b.dataset.paso))));
    pintarN();
  }));
  hoja.querySelector('.ficha-modo').addEventListener('click', e => {
    const b = e.target.closest('[data-modo]');
    if (b && !ocupado) setModo(b.dataset.modo);
  });
  hoja.querySelectorAll('[data-n="deposito"], [data-n="salon"]').forEach(caja => caja.addEventListener('click', () => {
    if (ocupado || caja.dataset.n === estado.sector) return;
    estado.sector = caja.dataset.n;
    guardarPreferencias();
    emitir('sector');
    if (modo === 'corregir') n = String(art[estado.sector] ?? 0);
    pintarNumeros();
    pintarModo();
  }));
  textarea.addEventListener('input', pintarN);
  okBtn.addEventListener('click', confirmar);
  fondo.addEventListener('click', () => cerrar());

  document.addEventListener('keydown', e => {
    if (hoja.hidden) return;
    if (e.key === 'Escape') { cerrar(); return; }
    if (e.target === textarea) return;
    if (/^\d$/.test(e.key)) tecla(e.key);
    else if (e.key === 'Backspace') tecla('borrar');
    else if (e.key === 'Enter') confirmar();
  });

  // Arrastrar el agarre hacia abajo cierra la hoja.
  const agarre = $('ficha-agarre');
  let y0 = null;
  agarre.addEventListener('pointerdown', e => { y0 = e.clientY; agarre.setPointerCapture(e.pointerId); hoja.style.transition = 'none'; });
  agarre.addEventListener('pointermove', e => {
    if (y0 === null) return;
    hoja.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`;
  });
  const soltar = e => {
    if (y0 === null) return;
    const dy = e.clientY - y0;
    y0 = null;
    hoja.style.transition = '';
    if (dy > 90) cerrar(); else hoja.style.transform = '';
  };
  agarre.addEventListener('pointerup', soltar);
  agarre.addEventListener('pointercancel', soltar);

  on('abrirFicha', abrir);
  on('articulo', a => { if (art && a === art && !ocupado) pintarNumeros(); });
  on('catalogo', () => {
    if (!art) return;
    const nuevo = estado.porCod.get(art.cod);
    if (nuevo) { art = nuevo; if (!ocupado) pintarNumeros(); }
  });

  return { abrir, cerrar };
}
