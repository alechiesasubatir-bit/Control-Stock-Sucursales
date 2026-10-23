// Arranque y navegación.
import { estado, on, cola, cargarCatalogo, cambiarSucursal, NOMBRES } from './estado.js';
import { logoSVG } from './logo.js';
import { initIngreso } from './ui/ingreso.js';
import { ir, registrarPantalla } from './nav.js';
import { initEscanear } from './ui/escanear.js';
import { initVisor } from './ui/visor.js';
import { initFicha } from './ui/ficha.js';
import { initCargas } from './ui/cargas.js';
import { initArticulos } from './ui/articulos.js';
import { initConfeti } from './ui/confeti.js';

const $ = id => document.getElementById(id);
// ── Avisos ───────────────────────────────────────────────
on('aviso', ({ texto, tipo }) => {
  const el = document.createElement('div');
  el.className = 'aviso ' + tipo;
  el.textContent = texto;
  $('avisos').append(el);
  setTimeout(() => { el.classList.add('sale'); el.addEventListener('animationend', () => el.remove(), { once: true }); }, tipo === 'error' ? 5000 : 2600);
});

// ── Encabezado ───────────────────────────────────────────
function pintarEncabezado() {
  $('encabezado-logo').innerHTML = logoSVG();
  $('encabezado-sucursal').textContent = NOMBRES[estado.sucursal] || '—';
  $('encabezado-usuario').textContent = estado.usuario;
  $('menu-quien').textContent = `${estado.usuario} · ${NOMBRES[estado.sucursal] || ''}`;
}

function pintarRed() {
  const n = cola.pendientes().length;
  const el = $('indicador-red');
  const txt = el.querySelector('.red-texto');
  if (!estado.redOk) { el.dataset.estado = 'sinred'; txt.textContent = n ? `Sin conexión · ${n}` : 'Sin conexión'; }
  else if (n) { el.dataset.estado = 'pendiente'; txt.textContent = `Guardando ${n}`; }
  else if (estado.cargando && !estado.articulos.length) { el.dataset.estado = 'pendiente'; txt.textContent = 'Cargando'; }
  else { el.dataset.estado = 'ok'; txt.textContent = 'Al día'; }
  const ins = $('insignia-pendientes');
  ins.hidden = !n;
  ins.textContent = n;
}
on('red', pintarRed);

$('indicador-red').addEventListener('click', () => { cola.procesar(); cargarCatalogo(); });

// ── Menú ─────────────────────────────────────────────────
const menu = $('menu');
$('abrir-menu').addEventListener('click', () => { menu.hidden = false; });
menu.addEventListener('click', e => {
  const accion = e.target.closest('[data-menu]')?.dataset.menu;
  menu.hidden = true;
  if (accion === 'sucursal') ir('ingreso');
  if (accion === 'actualizar') { cargarCatalogo(); cola.procesar(); }
  if (accion === 'encargado') ir('encargado');
});

document.querySelectorAll('.barra [data-ir]').forEach(b => b.addEventListener('click', () => ir(b.dataset.ir)));

// ── Arranque ─────────────────────────────────────────────
registrarPantalla('ingreso', initIngreso({
  alEntrar: ({ cambioSucursal }) => {
    pintarEncabezado();
    if (cambioSucursal) cambiarSucursal(estado.sucursal);
    else if (!estado.articulos.length) cargarCatalogo();
    ir('escanear');
  },
}));

const escanear = initEscanear({ abrirVisor: () => visor.abrir() });
registrarPantalla('escanear', escanear);
const visor = initVisor({ buscarAMano: codigo => { ir('escanear'); escanear.buscarTexto(codigo); } });
initFicha({ reabrirVisor: () => visor.abrir() });
registrarPantalla('cargas', initCargas());
registrarPantalla('articulos', initArticulos());
initConfeti();

function arrancar() {
  if (!estado.usuario || !estado.sucursal) { ir('ingreso'); return; }
  pintarEncabezado();
  ir('escanear');
  cargarCatalogo();
}

cola.procesar();
pintarRed();
setInterval(() => { if (document.visibilityState === 'visible' && estado.sucursal) cargarCatalogo(); }, 60000);
window.addEventListener('online', () => cola.procesar());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { cola.procesar(); if (estado.sucursal) cargarCatalogo(); }
});

arrancar();
