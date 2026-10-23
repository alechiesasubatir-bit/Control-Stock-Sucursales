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
  yaAplicadas.delete(op.id);
  const reg = cargaPorId(op.id);
  if (reg && op.accion !== 'deshacer') reg.estado = 'guardada';
  guardarCargas();
  if (op.sucursal === estado.sucursal) {
    if (r.articulo) confirmar(r.articulo);
    else reconstruir(op.cod);
  }
  emitir('cargas');
});

cola.onError((op, r) => {
  yaAplicadas.delete(op.id);
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
  if (op.sucursal === estado.sucursal) reconstruir(op.cod);
  emitir('cargas');
  cargarCatalogo();
});

// ── Cargas ───────────────────────────────────────────────
export const cargaPorId = id => estado.cargas.find(c => c.id === id);

function guardarCargas() {
  escribir('css.cargas', estado.cargas.slice(0, 400));
}

export const cargasVisibles = () => estado.cargas.filter(c => c.sucursal === estado.sucursal && c.accion !== 'deshacer');

// Aplica una carga pendiente sobre el artículo en pantalla.
function aplicarOp(op, art) {
  if (op.accion === 'sumar') art[op.sector] = (art[op.sector] ?? 0) + op.cantidad;
  else if (op.accion === 'corregir') art[op.sector] = op.valor;
  else if (op.accion === 'comentar') art.comentario = op.texto;
  else if (op.accion === 'deshacer') { const orig = cargaPorId(op.idOriginal); if (orig) revertirLocal(orig, art); }
}

function revertirLocal(reg, art) {
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
  const antes = !art ? null : op.accion === 'comentar' ? art.comentario : op.sector ? art[op.sector] : null;
  estado.cargas.unshift({
    id: op.id, accion: op.accion, sucursal: op.sucursal, sector: op.sector, cod: op.cod,
    desc: art?.desc || op.cod, cantidad: op.cantidad, valor: op.valor, texto: op.texto,
    idOriginal: op.idOriginal, antes: antes ?? null, hora: Date.now(), estado: 'pendiente',
  });
  guardarCargas();
  cola.agregar(op);
  reconstruir(op.cod);
  emitir('cargas');
  cola.procesar();
  return op;
}

export function deshacerCarga(reg) {
  if (reg.estado === 'deshecha' || reg.estado === 'error') return;
  if (cola.quitar(reg.id)) {
    // Nunca salió del celular: se borra de la cola y la pantalla se recalcula sin ella.
    reg.estado = 'deshecha';
    guardarCargas();
    reconstruir(reg.cod);
  } else {
    // Ya salió (o pudo salir): se encola un deshacer detrás y el servidor los aplica en orden.
    reg.estado = 'deshecha';
    registrarCarga({ accion: 'deshacer', cod: reg.cod, idOriginal: reg.id });
  }
  emitir('cargas');
}

// ── Catálogo ─────────────────────────────────────────────
// En pantalla = lo último que confirmó el servidor + las cargas que siguen en la cola.
// "servidor" nunca lleva cargas pendientes encima; es lo que se guarda en la caché.
const servidor = new Map();
const confirmadoEn = new Map();   // cod → número de orden del último resultado del servidor
// Contador en vez de reloj: dos eventos en el mismo milisegundo no quedan empatados.
let orden = 0;
const yaAplicadas = new Set();    // cargas en la cola que el servidor ya tiene (lo informó el catálogo)
const clonar = a => ({ ...a, codigos: [...(a.codigos || [])] });

function pendientesDe(cod) {
  return cola.pendientes().filter(op => op.sucursal === estado.sucursal && (!cod || op.cod === cod) && !yaAplicadas.has(op.id));
}

function reconstruir(cod) {
  const art = estado.porCod.get(cod);
  const base = servidor.get(cod);
  if (!art || !base) return;
  Object.assign(art, clonar(base));
  for (const op of pendientesDe(cod)) aplicarOp(op, art);
  emitir('articulo', art);
}

function indexar() {
  estado.porCod = new Map(estado.articulos.map(a => [a.cod, a]));
  estado.indice = crearIndice(estado.articulos);
}

function guardarCache() {
  const articulos = estado.articulos.map(a => servidor.get(a.cod)).filter(Boolean);
  escribir('css.catalogo.' + estado.sucursal, { articulos, conteo: estado.conteo });
}

function confirmar(a) {
  servidor.set(a.cod, clonar(a));
  confirmadoEn.set(a.cod, ++orden);
  if (!estado.porCod.has(a.cod)) { estado.articulos.push(clonar(a)); indexar(); }
  reconstruir(a.cod);
  guardarCache();
}

// desde: número de orden cuando se pidió el catálogo. Un artículo confirmado después
// es más nuevo que el catálogo y se conserva.
function aplicarCatalogo(c, { desde = null, aplicados = [] } = {}) {
  const nuevos = new Map();
  for (const a of c.articulos) {
    const previo = servidor.get(a.cod);
    const masNuevo = desde !== null && previo && (confirmadoEn.get(a.cod) ?? -1) > desde;
    nuevos.set(a.cod, masNuevo ? previo : clonar(a));
  }
  servidor.clear();
  nuevos.forEach((v, k) => servidor.set(k, v));
  aplicados.forEach(id => yaAplicadas.add(id));
  estado.articulos = c.articulos.map(a => clonar(servidor.get(a.cod)));
  indexar();
  for (const op of pendientesDe()) { const art = estado.porCod.get(op.cod); if (art) aplicarOp(op, art); }
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
  const desde = ++orden;
  const pendientes = cola.pendientes().filter(o => o.sucursal === suc).map(o => o.id);
  try {
    const r = await llamar({ accion: 'catalogo', sucursal: suc, pendientes }, { timeout: 30000 });
    if (suc !== estado.sucursal) return;
    if (!r.ok) { aviso('No se pudo leer la planilla: ' + (r.error || r.codigo), 'error'); return; }
    marcarRed(true);
    aplicarCatalogo(r, { desde, aplicados: r.aplicados || [] });
    guardarCache();
  } catch {
    marcarRed(false);
  } finally {
    estado.cargando = false;
    emitir('red');
  }
}

export function cambiarSucursal(suc) {
  estado.sucursal = suc;
  servidor.clear();
  confirmadoEn.clear();
  yaAplicadas.clear();
  estado.articulos = [];
  indexar();
  guardarPreferencias();
  emitir('catalogo');
  emitir('cargas');
  return cargarCatalogo();
}

// Suma al registro local las cargas de este usuario que vienen del servidor (por ejemplo, de otro celular).
export function incorporarHistorial(cargasServidor) {
  const locales = new Set(estado.cargas.map(c => c.id));
  const num = v => (v === '' || v === null || v === undefined ? null : Number(v));
  let nuevas = 0;
  for (const c of cargasServidor) {
    if (c.accion === 'deshacer' || c.accion === 'nuevo_conteo') continue;
    const reg = cargaPorId(c.id);
    if (reg) {
      if (c.estado === 'deshecho' && reg.estado !== 'deshecha') { reg.estado = 'deshecha'; nuevas++; }
      continue;
    }
    if (locales.has(c.id)) continue;
    estado.cargas.push({
      id: c.id, accion: c.accion, sucursal: estado.sucursal, sector: c.sector || undefined, cod: String(c.cod_art),
      desc: c.descripcion, cantidad: num(c.cantidad), valor: c.accion === 'corregir' ? num(c.despues) : undefined,
      texto: c.accion === 'comentar' ? String(c.despues) : undefined,
      antes: c.accion === 'comentar' ? String(c.antes ?? '') : num(c.antes),
      hora: Date.parse(c.fecha_hora) || Date.now(), estado: c.estado === 'deshecho' ? 'deshecha' : 'guardada',
    });
    nuevas++;
  }
  if (nuevas) {
    estado.cargas.sort((a, b) => b.hora - a.hora);
    guardarCargas();
    emitir('cargas');
  }
}
