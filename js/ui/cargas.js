// Mis cargas: lo que cargó esta persona en el conteo vigente, con deshacer.
import { estado, on, cargasVisibles, cargaPorId, deshacerCarga, incorporarHistorial, NOMBRES } from '../estado.js';
import { llamar } from '../api.js';
import { escapar } from './filas.js';

const ICONOS = {
  guardada: '<svg viewBox="0 0 24 24"><path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 8a4 4 0 0 1-.5 10z"/><path d="m9.5 13 2 2 3.5-4"/></svg>',
  pendiente: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7"/></svg>',
  error: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>',
  deshecha: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
};
const DESHACER = ICONOS.deshecha;
const TEXTO_ESTADO = { guardada: 'Guardada', pendiente: 'Guardando…', error: 'No se guardó', deshecha: 'Deshecha' };

function delta(c) {
  if (c.accion === 'sumar') return `<span class="carga-delta mas">+${c.cantidad}</span>`;
  if (c.accion === 'corregir') return `<span class="carga-delta igual">= ${c.valor}</span>`;
  return '<span class="carga-delta">💬</span>';
}

function fila(c) {
  const hora = new Date(c.hora).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });
  const donde = c.accion === 'comentar' ? (c.texto ? `“${escapar(c.texto)}”` : 'Comentario borrado') : NOMBRES[c.sector] || '';
  const puede = c.estado === 'guardada' || c.estado === 'pendiente';
  return `<li class="fila carga" data-id="${escapar(c.id)}" data-estado="${c.estado}">
    <span class="carga-hora">${hora}</span>
    <span class="fila-cuerpo">
      <span class="fila-titulo">${escapar(c.desc)}</span>
      <span class="fila-sub"><span>${donde}</span><span>${TEXTO_ESTADO[c.estado]}</span></span>
      ${c.estado === 'error' && c.error ? `<span class="carga-error">${escapar(c.error)}</span>` : ''}
    </span>
    ${delta(c)}
    <span class="carga-estado" title="${TEXTO_ESTADO[c.estado]}">${ICONOS[c.estado]}</span>
    ${puede ? `<button class="carga-deshacer" data-deshacer aria-label="Deshacer">${DESHACER}</button>` : ''}
  </li>`;
}

export function initCargas() {
  const lista = document.getElementById('lista-cargas');
  const vacio = document.getElementById('cargas-vacio');
  let visible = false;

  function pintar() {
    const cs = cargasVisibles();
    vacio.hidden = cs.length > 0;
    lista.innerHTML = cs.map(fila).join('');
  }

  async function traerHistorial() {
    try {
      const r = await llamar({ accion: 'historial', sucursal: estado.sucursal, usuario: estado.usuario });
      if (r.ok) incorporarHistorial(r.cargas);
    } catch { /* sin conexión: se muestra lo local */ }
  }

  function deshacer(id) {
    const c = cargaPorId(id);
    if (!c) return;
    navigator.vibrate?.(15);
    deshacerCarga(c);
  }

  lista.addEventListener('click', e => {
    const b = e.target.closest('[data-deshacer]');
    if (b) deshacer(b.closest('[data-id]').dataset.id);
  });

  // Deslizar a la izquierda deshace.
  let toque = null;
  lista.addEventListener('pointerdown', e => {
    const f = e.target.closest('.carga');
    if (!f || !f.querySelector('[data-deshacer]') || e.target.closest('button')) return;
    toque = { f, x: e.clientX, y: e.clientY, dx: 0 };
  });
  lista.addEventListener('pointermove', e => {
    if (!toque) return;
    toque.dx = Math.min(0, e.clientX - toque.x);
    if (Math.abs(e.clientY - toque.y) > 24 && toque.dx > -20) { toque.f.style.transform = ''; toque = null; return; }
    toque.f.style.transition = 'none';
    toque.f.style.transform = `translateX(${toque.dx}px)`;
  });
  const soltar = () => {
    if (!toque) return;
    const { f, dx } = toque;
    toque = null;
    f.style.transition = '';
    f.style.transform = '';
    if (dx < -90) deshacer(f.dataset.id);
  };
  lista.addEventListener('pointerup', soltar);
  lista.addEventListener('pointercancel', soltar);

  on('cargas', () => { if (visible) pintar(); });

  return {
    mostrar() { visible = true; pintar(); traerHistorial(); },
    ocultar() { visible = false; },
  };
}
