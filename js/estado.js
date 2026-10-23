// Estado de la app: preferencias, catálogo, cargas y cola. Las pantallas lo leen y escuchan eventos.
import { crearIndice } from './catalogo.js';
import { llamar } from './api.js';
import { crearCola } from './cola.js';

export function leer(k, def) {
  try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch { return def; }
}
export function escribir(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento: sigue en memoria */ }
}

export const estado = {
  usuario: leer('css.usuario', ''),
  sucursal: leer('css.sucursal', ''),
  sector: leer('css.sector', 'deposito'),
  articulos: [],
  porCod: new Map(),
  indice: new Map(),
  conteo: '',
  cargas: leer('css.cargas', []),
  redOk: true,
  cargando: false,
};

export const NOMBRES = { solymar: 'Solymar', minas: 'Minas', deposito: 'Depósito', salon: 'Salón' };

const oyentes = {};
export const on = (ev, fn) => { (oyentes[ev] ||= []).push(fn); };
export const emitir = (ev, d) => { (oyentes[ev] || []).forEach(fn => fn(d)); };
export const aviso = (texto, tipo = '') => emitir('aviso', { texto, tipo });

export function guardarPreferencias() {
  escribir('css.usuario', estado.usuario);
  escribir('css.sucursal', estado.sucursal);
  escribir('css.sector', estado.sector);
}

export function nuevoId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// ── Cola ─────────────────────────────────────────────────
function marcarRed(ok) {
  if (estado.redOk === ok) return;
  estado.redOk = ok;
  emitir('red');
}

export const cola = crearCola({
  enviar: async op => {
    try { const r = await llamar(op); marcarRed(true); return r; } catch (e) { marcarRed(false); throw e; }
  },
  guardar: lista => escribir('css.cola', lista),
  cargar: () => leer('css.cola', []),
});
cola.onCambio(() => emitir('red'));

cola.onResultado((op, r) => {
  const reg = cargaPorId(op.id);
  if (reg && op.accion !== 'deshacer') reg.estado = 'guardada';
  guardarCargas();
  if (r.articulo && op.sucursal === estado.sucursal) actualizarArticulo(r.articulo);
  emitir('cargas');
});

cola.onError((op, r) => {
  const texto = r?.error || 'No se pudo guardar';
  if (op.accion === 'deshacer') {
    const orig = cargaPorId(op.idOriginal);
    if (orig) orig.estado = 'guardada';
    aviso(r?.codigo === 'CONFLICTO' ? 'No se pudo deshacer: el número cambió después de esa carga.' : 'No se pudo deshacer: ' + texto, 'error');
  } else {
    const reg = cargaPorId(op.id);
    if (reg) { reg.estado = 'error'; reg.error = texto; }
    aviso('No se guardó: ' + texto, 'error');
  }
  guardarCargas();
  emitir('cargas');
  cargarCatalogo();
});

// ── Cargas ───────────────────────────────────────────────
export const cargaPorId = id => estado.cargas.find(c => c.id === id);

function guardarCargas() {
  escribir('css.cargas', estado.cargas.slice(0, 400));
}

export const cargasVisibles = () => estado.cargas.filter(c => c.sucursal === estado.sucursal && c.accion !== 'deshacer');

// Aplica una operación sobre el artículo en memoria y devuelve el valor anterior.
function aplicarLocal(op, art) {
  if (!art) return undefined;
  if (op.accion === 'sumar') { const antes = art[op.sector]; art[op.sector] = (antes ?? 0) + op.cantidad; return antes; }
  if (op.accion === 'corregir') { const antes = art[op.sector]; art[op.sector] = op.valor; return antes; }
  if (op.accion === 'comentar') { const antes = art.comentario; art.comentario = op.texto; return antes; }
  if (op.accion === 'deshacer') { const orig = cargaPorId(op.idOriginal); if (orig) revertirLocal(orig, art); }
  return undefined;
}

function revertirLocal(reg, art) {
  if (!art) return;
  if (reg.accion === 'sumar') {
    const v = Math.max(0, (art[reg.sector] ?? 0) - reg.cantidad);
    art[reg.sector] = reg.antes === null && v === 0 ? null : v;
  } else if (reg.accion === 'corregir') {
    art[reg.sector] = reg.antes ?? null;
  } else if (reg.accion === 'comentar') {
    art.comentario = reg.antes ?? '';
  }
}

export function registrarCarga(datos) {
  const op = { ...datos, id: datos.id || nuevoId(), sucursal: estado.sucursal, usuario: estado.usuario };
  const art = estado.porCod.get(op.cod);
  const antes = aplicarLocal(op, art);
  estado.cargas.unshift({
    id: op.id, accion: op.accion, sucursal: op.sucursal, sector: op.sector, cod: op.cod,
    desc: art?.desc || op.cod, cantidad: op.cantidad, valor: op.valor, texto: op.texto,
    idOriginal: op.idOriginal, antes: antes === undefined ? null : antes, hora: Date.now(), estado: 'pendiente',
  });
  guardarCargas();
  cola.agregar(op);
  emitir('articulo', art);
  emitir('cargas');
  cola.procesar();
  return op;
}

export function deshacerCarga(reg) {
  if (reg.estado === 'deshecha' || reg.estado === 'error') return;
  const art = estado.porCod.get(reg.cod);
  if (cola.quitar(reg.id)) {
    // Nunca llegó al servidor: se borra de la cola y se revierte en pantalla.
    revertirLocal(reg, art);
    reg.estado = 'deshecha';
    guardarCargas();
  } else {
    registrarCarga({ accion: 'deshacer', cod: reg.cod, idOriginal: reg.id });
    reg.estado = 'deshecha';
    guardarCargas();
  }
  emitir('articulo', art);
  emitir('cargas');
}

// ── Catálogo ─────────────────────────────────────────────
function reaplicarPendientes(cod) {
  for (const op of cola.pendientes()) {
    if (op.sucursal !== estado.sucursal || (cod && op.cod !== cod)) continue;
    aplicarLocal(op, estado.porCod.get(op.cod));
  }
}

function indexar() {
  estado.porCod = new Map(estado.articulos.map(a => [a.cod, a]));
  estado.indice = crearIndice(estado.articulos);
}

export function actualizarArticulo(a) {
  const actual = estado.porCod.get(a.cod);
  if (actual) Object.assign(actual, a);
  else { estado.articulos.push(a); indexar(); }
  reaplicarPendientes(a.cod);
  emitir('articulo', estado.porCod.get(a.cod));
}

function aplicarCatalogo(c) {
  estado.articulos = c.articulos.map(a => ({ ...a }));
  indexar();
  reaplicarPendientes();
  const conteos = leer('css.conteos', {});
  if (conteos[estado.sucursal] && conteos[estado.sucursal] !== c.conteo) {
    // Hubo un Nuevo conteo: las cargas viejas de esta sucursal ya no se pueden deshacer.
    const pendientes = new Set(cola.pendientes().map(o => o.id));
    estado.cargas = estado.cargas.filter(x => x.sucursal !== estado.sucursal || pendientes.has(x.id));
    guardarCargas();
    emitir('cargas');
  }
  conteos[estado.sucursal] = c.conteo;
  escribir('css.conteos', conteos);
  estado.conteo = c.conteo;
  emitir('catalogo');
}

export async function cargarCatalogo() {
  const suc = estado.sucursal;
  if (!suc) return;
  if (!estado.articulos.length) {
    const guardado = leer('css.catalogo.' + suc, null);
    if (guardado) aplicarCatalogo(guardado);
  }
  if (estado.cargando) return;
  estado.cargando = true;
  emitir('red');
  try {
    const r = await llamar({ accion: 'catalogo', sucursal: suc }, { timeout: 30000 });
    if (suc !== estado.sucursal) return;
    if (!r.ok) { aviso('No se pudo leer la planilla: ' + (r.error || r.codigo), 'error'); return; }
    marcarRed(true);
    escribir('css.catalogo.' + suc, { articulos: r.articulos, conteo: r.conteo });
    aplicarCatalogo(r);
  } catch {
    marcarRed(false);
  } finally {
    estado.cargando = false;
    emitir('red');
  }
}

export function cambiarSucursal(suc) {
  estado.sucursal = suc;
  estado.articulos = [];
  indexar();
  guardarPreferencias();
  emitir('catalogo');
  emitir('cargas');
  return cargarCatalogo();
}
