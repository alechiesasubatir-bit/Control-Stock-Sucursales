import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const L = createRequire(import.meta.url)('../apps-script/logica.js');

const ENC = ['Cod. Art', 'Alternativo', 'Descripcion', ' Precio', 'DEPOSITO', 'LOCAL SOLYMAR', 'TOTAL DE STOCK', 'PARA SUBIR STOCK', 'Comentarios'];
const V = [
  ['330056', '4056807558707', 'Antiempañante', 432, 3, '', '', '', ''],
  ['330056', '7891799092450', 'Antiempañante', 432, '', 2, '', '', 'ojo'],
  ['330056', '7891799992453', 'Antiempañante', 432, '', '', '', '', ''],
  ['', '7790000000001', 'Sin cod art', 10, '', '', '', '', ''],
  ['', '', 'Fila vacia', '', '', '', '', '', ''],
  ['330004', '915120013255', 'Acido Citrico', 277, 0, '', '', '', ''],
];

test('ubica columnas por encabezado aunque se inserte una', () => {
  const c = L.ubicarColumnas(['X', ...ENC]);
  assert.equal(c.deposito, 5); assert.equal(c.salon, 6); assert.equal(c.coment, 9); assert.equal(c.cod, 1);
});
test('falta columna -> error', () => assert.throws(() => L.ubicarColumnas(['Cod. Art']), /DATOS_INVALIDOS/));
test('encabezado LOCAL MINAS sirve como salon', () => {
  assert.equal(L.ubicarColumnas(ENC.map(h => h === 'LOCAL SOLYMAR' ? 'LOCAL MINAS' : h)).salon, 5);
});
test('parsearCantidad', () => {
  assert.equal(L.parsearCantidad(''), null);
  assert.equal(L.parsearCantidad(null), null);
  assert.equal(L.parsearCantidad(0), 0);
  assert.equal(L.parsearCantidad('12 '), 12);
  assert.equal(L.parsearCantidad('12,0'), 12);
  assert.equal(L.parsearCantidad('abc'), null);
});
test('agrupa repetidos y suma valores cargados a mano', () => {
  const a = L.agruparFilas(V, L.ubicarColumnas(ENC));
  assert.equal(a.length, 3);
  assert.deepEqual(a[0], { cod: '330056', codigos: ['4056807558707', '7891799092450', '7891799992453'], desc: 'Antiempañante', precio: 432, deposito: 3, salon: 2, comentario: 'ojo', fila: 2 });
  assert.equal(a[1].cod, '7790000000001');
  assert.equal(a[1].fila, 5);
  assert.equal(a[2].deposito, 0);
  assert.equal(a[2].salon, null);
});
test('cod art numerico en la planilla se trata como texto', () => {
  const a = L.agruparFilas([[330001, 7730171681014, 'Abrillantador', 320, '', '', '', '', '']], L.ubicarColumnas(ENC));
  assert.equal(a[0].cod, '330001'); assert.deepEqual(a[0].codigos, ['7730171681014']);
});
test('fila por cod art en el momento de escribir', () => {
  const c = L.ubicarColumnas(ENC);
  assert.equal(L.filaDeArticulo(V, c, '330004'), 7);
  assert.equal(L.filaDeArticulo([V[5], ...V], c, '330004'), 2);
  assert.equal(L.filaDeArticulo(V, c, '7790000000001'), 5);
  assert.equal(L.filaDeArticulo(V, c, '999'), null);
});
test('filasDeArticulo devuelve todas las filas del grupo', () => {
  assert.deepEqual(L.filasDeArticulo(V, L.ubicarColumnas(ENC), '330056'), [2, 3, 4]);
});
test('aplicar', () => {
  assert.equal(L.aplicar('sumar', null, 5), 5);
  assert.equal(L.aplicar('sumar', 3, 5), 8);
  assert.equal(L.aplicar('corregir', 8, 0), 0);
});
test('deshacer sumar no baja de cero', () => {
  assert.deepEqual(L.calcularDeshacer({ accion: 'sumar', cantidad: 5, antes: 3, despues: 8, estado: '' }, 2), { valor: 0 });
});
test('deshacer sumar normal', () => {
  assert.deepEqual(L.calcularDeshacer({ accion: 'sumar', cantidad: 5, antes: 3, despues: 8, estado: '' }, 8), { valor: 3 });
});
test('deshacer corregir con celda cambiada -> conflicto', () => {
  assert.deepEqual(L.calcularDeshacer({ accion: 'corregir', cantidad: 10, antes: 4, despues: 10, estado: '' }, 11), { error: 'CONFLICTO' });
});
test('deshacer corregir vuelve a vacio', () => {
  assert.deepEqual(L.calcularDeshacer({ accion: 'corregir', cantidad: 10, antes: '', despues: 10, estado: '' }, 10), { valor: null });
});
test('deshacer comentar', () => {
  assert.deepEqual(L.calcularDeshacer({ accion: 'comentar', cantidad: '', antes: 'viejo', despues: 'nuevo', estado: '' }, 'nuevo'), { valor: 'viejo' });
});
test('no se deshace dos veces', () => {
  assert.deepEqual(L.calcularDeshacer({ accion: 'sumar', cantidad: 1, antes: 0, despues: 1, estado: 'deshecho' }, 1), { error: 'DATOS_INVALIDOS' });
});
test('idempotencia: encuentra id ya aplicado', () => {
  assert.equal(L.buscarPorId([['a'], ['b']], 'b'), 1);
  assert.equal(L.buscarPorId([['a']], 'z'), null);
});
test('nombre de archivo', () => {
  assert.equal(L.nombreArchivo('Solymar', new Date(), 'X', () => '23-10-2026 14.30'), 'SOLYMAR 23-10-2026 14.30');
});
test('validar rechaza decimales, ceros, negativos y sucursal desconocida', () => {
  const base = { id: 'x', sucursal: 'solymar', sector: 'deposito', cod: '1', usuario: 'Ana' };
  assert.ok(L.validar({ ...base, accion: 'sumar', cantidad: 1.5 }));
  assert.ok(L.validar({ ...base, accion: 'sumar', cantidad: 0 }));
  assert.ok(L.validar({ ...base, accion: 'corregir', valor: -1 }));
  assert.equal(L.validar({ ...base, accion: 'corregir', valor: 0 }), null);
  assert.equal(L.validar({ ...base, accion: 'sumar', cantidad: 3 }), null);
  assert.ok(L.validar({ ...base, sucursal: 'otra', accion: 'sumar', cantidad: 1 }));
  assert.ok(L.validar({ ...base, sector: 'techo', accion: 'sumar', cantidad: 1 }));
  assert.ok(L.validar({ ...base, id: '', accion: 'sumar', cantidad: 1 }));
  assert.equal(L.validar({ id: 'x', sucursal: 'minas', cod: '1', usuario: 'Ana', accion: 'comentar', texto: '' }), null);
});
