// Lógica pura del backend. Se pega tal cual en Apps Script como Logica.gs.
// No usa APIs de Google para poder probarse en Node (tests/logica.test.mjs).

var SUCURSALES = ['solymar', 'minas'];
var SECTORES = ['deposito', 'salon'];

function claveEncabezado_(h) {
  return String(h == null ? '' : h).toLowerCase().replace(/[\s.]/g, '');
}

function ubicarColumnas(encabezados) {
  var k = encabezados.map(claveEncabezado_);
  function col(nombre, clave, prefijo) {
    for (var i = 0; i < k.length; i++) {
      if (prefijo ? k[i].indexOf(clave) === 0 : k[i] === clave) return i;
    }
    throw new Error('DATOS_INVALIDOS: falta columna ' + nombre);
  }
  return {
    cod: col('Cod. Art', 'codart'),
    alt: col('Alternativo', 'alternativo'),
    desc: col('Descripcion', 'descripcion'),
    precio: col('Precio', 'precio'),
    deposito: col('DEPOSITO', 'deposito'),
    salon: col('LOCAL', 'local', true),
    coment: col('Comentarios', 'comentarios'),
  };
}

function parsearCantidad(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? Math.round(v) : null;
  var s = String(v).trim().replace(',', '.');
  if (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(Number(s));
}

function texto_(v) {
  return String(v == null ? '' : v).trim();
}

function normalizar_(c) {
  return texto_(c).replace(/\s+/g, '').replace(/^0+/, '');
}

// Clave del artículo: Cod. Art, o el Alternativo si la fila no tiene Cod. Art.
function claveFila_(fila, cols) {
  return texto_(fila[cols.cod]) || texto_(fila[cols.alt]);
}

function agruparFilas(valores, cols) {
  var porClave = {};
  var orden = [];
  for (var i = 0; i < valores.length; i++) {
    var f = valores[i];
    var clave = claveFila_(f, cols);
    if (!clave) continue;
    var a = porClave[clave];
    if (!a) {
      a = porClave[clave] = {
        cod: clave, codigos: [], desc: texto_(f[cols.desc]),
        precio: parsearCantidad(f[cols.precio]), deposito: null, salon: null,
        comentario: '', fila: i + 2, _coments: [],
      };
      orden.push(a);
    }
    var alt = texto_(f[cols.alt]);
    if (alt && a.codigos.indexOf(alt) === -1) a.codigos.push(alt);
    var d = parsearCantidad(f[cols.deposito]);
    var s = parsearCantidad(f[cols.salon]);
    if (d !== null) a.deposito = (a.deposito || 0) + d;
    if (s !== null) a.salon = (a.salon || 0) + s;
    var c = texto_(f[cols.coment]);
    if (c) a._coments.push(c);
  }
  return orden.map(function (a) {
    a.comentario = a._coments.join(' · ');
    delete a._coments;
    return a;
  });
}

function filasDeArticulo(valores, cols, cod) {
  var buscado = normalizar_(cod);
  var out = [];
  if (!buscado) return out;
  for (var i = 0; i < valores.length; i++) {
    if (normalizar_(claveFila_(valores[i], cols)) === buscado) out.push(i + 2);
  }
  return out;
}

function filaDeArticulo(valores, cols, cod) {
  var filas = filasDeArticulo(valores, cols, cod);
  return filas.length ? filas[0] : null;
}

function aplicar(accion, actual, n) {
  return accion === 'sumar' ? (actual || 0) + n : n;
}

function comoTexto_(v) {
  return v === null || v === undefined ? '' : String(v);
}

function calcularDeshacer(reg, actual) {
  if (reg.estado === 'deshecho') return { error: 'DATOS_INVALIDOS' };
  if (reg.accion === 'sumar') {
    return { valor: Math.max(0, (parsearCantidad(actual) || 0) - Number(reg.cantidad)) };
  }
  if (reg.accion === 'corregir' || reg.accion === 'comentar') {
    if (comoTexto_(actual) !== comoTexto_(reg.despues)) return { error: 'CONFLICTO' };
    var antes = reg.antes === '' || reg.antes === undefined ? null : reg.antes;
    return { valor: antes };
  }
  return { error: 'DATOS_INVALIDOS' };
}

function buscarPorId(historial, id) {
  for (var i = 0; i < historial.length; i++) {
    if (String(historial[i][0]) === String(id)) return i;
  }
  return null;
}

function nombreArchivo(pestana, fecha, tz, formatear) {
  return String(pestana).toUpperCase() + ' ' + formatear(fecha, tz, 'dd-MM-yyyy HH.mm');
}

function esEntero_(n) {
  return typeof n === 'number' && isFinite(n) && Math.floor(n) === n;
}

function validar(p) {
  if (!p || !texto_(p.id)) return 'falta id';
  if (SUCURSALES.indexOf(p.sucursal) === -1) return 'sucursal desconocida';
  if (!texto_(p.cod)) return 'falta código';
  if (!texto_(p.usuario)) return 'falta usuario';
  if (p.accion === 'comentar') return null;
  if (SECTORES.indexOf(p.sector) === -1) return 'sector desconocido';
  if (p.accion === 'sumar') return esEntero_(p.cantidad) && p.cantidad > 0 ? null : 'la cantidad tiene que ser un entero mayor que 0';
  if (p.accion === 'corregir') return esEntero_(p.valor) && p.valor >= 0 ? null : 'el valor tiene que ser un entero desde 0';
  return 'acción desconocida';
}

if (typeof module !== 'undefined') {
  module.exports = {
    ubicarColumnas: ubicarColumnas, parsearCantidad: parsearCantidad, agruparFilas: agruparFilas,
    filaDeArticulo: filaDeArticulo, filasDeArticulo: filasDeArticulo, aplicar: aplicar,
    calcularDeshacer: calcularDeshacer, buscarPorId: buscarPorId, nombreArchivo: nombreArchivo,
    validar: validar,
  };
}
