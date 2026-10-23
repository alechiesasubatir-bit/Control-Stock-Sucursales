/** @OnlyCurrentDoc */
// Pide permiso solo sobre esta planilla, no sobre todas las del usuario.
// ============================================================
//  PROLIMPIO — Control de Stock Sucursales | Apps Script
//  Vinculado a la planilla "BALANCE SOLYMAR ALTERNATIVOS".
//  La lógica pura vive en Logica.gs (apps-script/logica.js).
//
//  Puesta en marcha:
//    1. Pegar Code.gs y Logica.gs en Extensiones → Apps Script.
//    2. Configuración del proyecto → Propiedades del script:
//       PIN_ENCARGADO = <pin>
//    3. Ejecutar instalar() una vez (pide autorización). Crea MINAS e HISTORIAL.
//    4. Implementar → Nueva implementación → Aplicación web
//       Ejecutar como: yo · Acceso: cualquier persona.
// ============================================================

var PESTANAS = { solymar: 'SOLYMAR', minas: 'MINAS' };
var HISTORIAL = 'HISTORIAL';
var ENC_HISTORIAL = ['id', 'fecha_hora', 'sucursal', 'sector', 'cod_art', 'descripcion', 'accion',
  'cantidad', 'antes', 'despues', 'usuario', 'conteo', 'estado'];
var H = { id: 0, sucursal: 2, sector: 3, cod: 4, accion: 6, cantidad: 7, antes: 8, despues: 9, conteo: 11, estado: 12 };

// ── Entrada ──────────────────────────────────────────────────
function doGet() {
  return json_({ ok: true, app: 'control-stock-sucursales' });
}

function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);
    var acciones = {
      catalogo: catalogo_, sumar: cargar_, corregir: cargar_, comentar: comentar_,
      deshacer: deshacer_, historial: historial_, nuevoConteo: nuevoConteo_,
    };
    var fn = acciones[p.accion];
    if (!fn) throw new Error('DATOS_INVALIDOS: acción desconocida');
    return json_(fn(p));
  } catch (err) {
    var m = String(err && err.message || err);
    var partes = /^([A-Z_]+): (.*)$/.exec(m);
    return json_(partes ? { ok: false, codigo: partes[1], error: partes[2] }
      : { ok: false, codigo: 'ERROR', error: m });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ── Utilidades ───────────────────────────────────────────────
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

// Solymar puede seguir llamándose "Hoja 1": no se renombra para no romper planillas que la lean de afuera.
var OTROS_NOMBRES = { solymar: ['Hoja 1'], minas: [] };

function buscarHoja_(sucursal) {
  var ss = ss_();
  var nombres = [PESTANAS[sucursal]].concat(OTROS_NOMBRES[sucursal] || []);
  for (var i = 0; i < nombres.length; i++) {
    var h = ss.getSheetByName(nombres[i]);
    if (h) return h;
  }
  return null;
}

function hoja_(sucursal) {
  if (!PESTANAS[sucursal]) throw new Error('DATOS_INVALIDOS: sucursal desconocida');
  var h = buscarHoja_(sucursal);
  if (!h) throw new Error('DATOS_INVALIDOS: no existe la pestaña ' + PESTANAS[sucursal] + ' (correr instalar)');
  return h;
}

function historialHoja_() {
  var h = ss_().getSheetByName(HISTORIAL);
  if (!h) throw new Error('DATOS_INVALIDOS: no existe HISTORIAL (correr instalar)');
  return h;
}

function conteoVigente_(sucursal) {
  return PropertiesService.getScriptProperties().getProperty('CONTEO_' + sucursal.toUpperCase()) || 'inicial';
}

// Texto que la planilla debe guardar tal cual: sin apóstrofo, "330001" pasaría a número,
// "23-10-2026 14.30" a fecha y "=..." a fórmula. El apóstrofo no se guarda.
function seguro_(v) {
  var s = String(v == null ? '' : v);
  return s === '' ? '' : "'" + s;
}

function conBloqueo_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('OCUPADO: la planilla está ocupada, reintentando');
  try { return fn(); } finally { lock.releaseLock(); }
}

function leer_(sucursal) {
  var hoja = hoja_(sucursal);
  var valores = hoja.getDataRange().getValues();
  return { hoja: hoja, cols: ubicarColumnas(valores[0]), filas: valores.slice(1) };
}

function articulo_(datos, cod) {
  var filas = filasDeArticulo(datos.filas, datos.cols, cod);
  if (!filas.length) throw new Error('ARTICULO_NO_ENCONTRADO: el código ' + cod + ' no está en la planilla');
  var a = agruparFilas(filas.map(function (f) { return datos.filas[f - 2]; }), datos.cols)[0];
  a.filas = filas;
  return a;
}

// Deja el valor en la primera fila del artículo y vacía esa columna en las repetidas.
function escribir_(datos, art, col, valor) {
  datos.hoja.getRange(art.filas[0], col + 1).setValue(valor === null ? '' : valor);
  for (var i = 1; i < art.filas.length; i++) {
    var f = art.filas[i];
    if (datos.filas[f - 2][col] !== '') datos.hoja.getRange(f, col + 1).setValue('');
  }
}

function publico_(a) {
  return { cod: a.cod, codigos: a.codigos, desc: a.desc, precio: a.precio,
    deposito: a.deposito, salon: a.salon, comentario: a.comentario };
}

function releer_(sucursal, cod) {
  SpreadsheetApp.flush();
  return publico_(articulo_(leer_(sucursal), cod));
}

function registrar_(fila) {
  historialHoja_().appendRow(fila.map(function (v) { return typeof v === 'string' ? seguro_(v) : v; }));
}

function yaAplicada_(id) {
  var h = historialHoja_();
  var n = h.getLastRow() - 1;
  if (n < 1) return null;
  var ids = h.getRange(2, 1, n, 1).getValues();
  var i = buscarPorId(ids, id);
  return i === null ? null : h.getRange(i + 2, 1, 1, ENC_HISTORIAL.length).getValues()[0];
}

// ── Acciones ─────────────────────────────────────────────────
function catalogo_(p) {
  var d = leer_(p.sucursal);
  return {
    ok: true,
    articulos: agruparFilas(d.filas, d.cols).map(publico_),
    conteo: conteoVigente_(p.sucursal),
    aplicados: aplicados_(p.pendientes),
    ahora: new Date().toISOString(),
  };
}

// De las cargas que el celular todavía tiene en la cola, cuáles ya están en HISTORIAL.
// Así el celular no las cuenta dos veces sobre un catálogo que ya las incluye.
function aplicados_(ids) {
  if (!ids || !ids.length) return [];
  var h = historialHoja_();
  var n = h.getLastRow() - 1;
  if (n < 1) return [];
  var hay = {};
  h.getRange(2, 1, n, 1).getValues().forEach(function (f) { hay[String(f[0])] = true; });
  return ids.filter(function (id) { return hay[String(id)]; });
}

function cargar_(p) {
  var error = validar(p);
  if (error) throw new Error('DATOS_INVALIDOS: ' + error);
  return conBloqueo_(function () {
    var previa = yaAplicada_(p.id);
    if (previa) return { ok: true, repetido: true, articulo: releer_(p.sucursal, p.cod) };
    var d = leer_(p.sucursal);
    var art = articulo_(d, p.cod);
    var n = p.accion === 'sumar' ? p.cantidad : p.valor;
    var col = p.sector === 'deposito' ? d.cols.deposito : d.cols.salon;
    var aMano = textoNoNumerico(d.filas, art.filas, col);
    if (aMano !== null && p.accion === 'sumar') {
      throw new Error('CONFLICTO: en la planilla dice "' + aMano + '" en ' + (p.sector === 'deposito' ? 'Depósito' : 'Salón') + '. Usá Corregir para dejar el número.');
    }
    var antes = aMano !== null ? aMano : art[p.sector];
    var despues = aplicar(p.accion, antes, n);
    escribir_(d, art, col, despues);
    registrar_([p.id, new Date(), p.sucursal, p.sector, art.cod, art.desc, p.accion, n,
      antes === null ? '' : antes, despues, p.usuario, conteoVigente_(p.sucursal), '']);
    return { ok: true, articulo: releer_(p.sucursal, art.cod) };
  });
}

function comentar_(p) {
  var error = validar(p);
  if (error) throw new Error('DATOS_INVALIDOS: ' + error);
  return conBloqueo_(function () {
    if (yaAplicada_(p.id)) return { ok: true, repetido: true, articulo: releer_(p.sucursal, p.cod) };
    var d = leer_(p.sucursal);
    var art = articulo_(d, p.cod);
    var texto = String(p.texto || '').trim();
    escribir_(d, art, d.cols.coment, seguro_(texto));
    registrar_([p.id, new Date(), p.sucursal, '', art.cod, art.desc, 'comentar', '',
      art.comentario, texto, p.usuario, conteoVigente_(p.sucursal), '']);
    return { ok: true, articulo: releer_(p.sucursal, art.cod) };
  });
}

function deshacer_(p) {
  if (!p.id || !p.idOriginal || !p.usuario) throw new Error('DATOS_INVALIDOS: faltan datos para deshacer');
  return conBloqueo_(function () {
    var h = historialHoja_();
    var previa = yaAplicada_(p.id);
    if (previa) return { ok: true, repetido: true, articulo: releer_(previa[H.sucursal], previa[H.cod]) };

    var n = h.getLastRow() - 1;
    var regs = n > 0 ? h.getRange(2, 1, n, ENC_HISTORIAL.length).getValues() : [];
    var i = buscarPorId(regs, p.idOriginal);
    if (i === null) throw new Error('DATOS_INVALIDOS: no se encontró la carga a deshacer');
    var r = regs[i];
    var sucursal = String(r[H.sucursal]);
    if (String(r[H.conteo]) !== conteoVigente_(sucursal)) {
      throw new Error('DATOS_INVALIDOS: esa carga es de un conteo anterior');
    }

    var d = leer_(sucursal);
    var art = articulo_(d, String(r[H.cod]));
    var accion = String(r[H.accion]);
    var sector = String(r[H.sector]);
    var col = accion === 'comentar' ? d.cols.coment : (sector === 'deposito' ? d.cols.deposito : d.cols.salon);
    var actual = accion === 'comentar' ? art.comentario : art[sector];
    var res = calcularDeshacer({ accion: accion, cantidad: r[H.cantidad], antes: r[H.antes],
      despues: r[H.despues], estado: r[H.estado] }, actual);
    if (res.error === 'CONFLICTO') throw new Error('CONFLICTO: el valor cambió después de esa carga');
    if (res.error) throw new Error('DATOS_INVALIDOS: esa carga no se puede deshacer');

    var valor = accion === 'comentar' ? seguro_(res.valor === null ? '' : res.valor) : res.valor;
    escribir_(d, art, col, valor);
    h.getRange(i + 2, H.estado + 1).setValue('deshecho');
    registrar_([p.id, new Date(), sucursal, sector, art.cod, art.desc, 'deshacer', r[H.id],
      actual === null ? '' : actual, res.valor === null ? '' : res.valor, p.usuario, conteoVigente_(sucursal), '']);
    return { ok: true, articulo: releer_(sucursal, art.cod) };
  });
}

function historial_(p) {
  var h = historialHoja_();
  var n = h.getLastRow() - 1;
  var conteo = conteoVigente_(p.sucursal);
  var regs = n > 0 ? h.getRange(2, 1, n, ENC_HISTORIAL.length).getValues() : [];
  var cargas = [];
  for (var i = regs.length - 1; i >= 0 && cargas.length < 200; i--) {
    var r = regs[i];
    if (r[H.sucursal] !== p.sucursal || String(r[H.conteo]) !== conteo) continue;
    if (r[H.accion] === 'nuevo_conteo') continue;
    if (p.usuario && String(r[10]) !== String(p.usuario)) continue;
    var c = {};
    ENC_HISTORIAL.forEach(function (k, j) { c[k] = r[j] instanceof Date ? r[j].toISOString() : r[j]; });
    cargas.push(c);
  }
  return { ok: true, cargas: cargas };
}

function nuevoConteo_(p) {
  var pin = PropertiesService.getScriptProperties().getProperty('PIN_ENCARGADO');
  if (!pin || String(p.pin) !== pin) throw new Error('PIN_INCORRECTO: el PIN no es correcto');
  if (!p.usuario) throw new Error('DATOS_INVALIDOS: falta usuario');
  return conBloqueo_(function () {
    var d = leer_(p.sucursal);
    var ss = ss_();
    var nombre = nombreArchivo(PESTANAS[p.sucursal], new Date(), ss.getSpreadsheetTimeZone(),
      function (f, tz, patron) { return Utilities.formatDate(f, tz, patron); });
    d.hoja.copyTo(ss).setName(nombre);
    limpiarConteo_(d.hoja, d.cols);
    var conteo = nombre.slice(PESTANAS[p.sucursal].length + 1);
    PropertiesService.getScriptProperties().setProperty('CONTEO_' + p.sucursal.toUpperCase(), conteo);
    registrar_([Utilities.getUuid(), new Date(), p.sucursal, '', '', nombre, 'nuevo_conteo', '', '', '',
      p.usuario, conteo, '']);
    return { ok: true, archivo: nombre };
  });
}

function limpiarConteo_(hoja, cols) {
  var n = hoja.getLastRow() - 1;
  if (n < 1) return;
  [cols.deposito, cols.salon, cols.coment].forEach(function (c) {
    hoja.getRange(2, c + 1, n, 1).clearContent();
  });
}

// ── Instalación (correr una vez a mano) ──────────────────────
function instalar() {
  var ss = ss_();
  var origen = buscarHoja_('solymar');
  if (!origen) throw new Error('No encuentro la pestaña de Solymar ("Hoja 1" o "SOLYMAR")');
  if (!ss.getSheetByName(PESTANAS.minas)) {
    var minas = origen.copyTo(ss).setName(PESTANAS.minas);
    var cols = ubicarColumnas(minas.getRange(1, 1, 1, minas.getLastColumn()).getValues()[0]);
    minas.getRange(1, cols.salon + 1).setValue('LOCAL MINAS');
    limpiarConteo_(minas, cols);
  }
  if (!ss.getSheetByName(HISTORIAL)) {
    var hist = ss.insertSheet(HISTORIAL);
    hist.appendRow(ENC_HISTORIAL);
    hist.setFrozenRows(1);
    hist.getRange(1, 1, 1, ENC_HISTORIAL.length).setFontWeight('bold');
  }
  Logger.log('Listo: ' + origen.getName() + ', MINAS e HISTORIAL presentes.');
}
