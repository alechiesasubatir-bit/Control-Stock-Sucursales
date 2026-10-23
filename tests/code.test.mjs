import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearGas } from './gas-falso.mjs';

const ENC = ['Cod. Art', 'Alternativo', 'Descripcion', ' Precio', 'DEPOSITO', 'LOCAL SOLYMAR', 'TOTAL DE STOCK', 'PARA SUBIR STOCK', 'Comentarios'];
const FILAS = () => [
  ENC,
  ['330001', '7730171681014', 'Abrillantador Piatti', 320, '', '', 0, '330001,0', ''],
  ['330056', '4056807558707', 'Antiempañante', 432, '', '', 0, '330056,0', ''],
  ['330056', '7891799092450', 'Antiempañante', 432, '', 4, 0, '330056,0', ''],
];
const base = { sucursal: 'solymar', usuario: 'Ana' };

function montar() {
  const g = crearGas({ hojas: { 'Hoja 1': FILAS() }, props: { PIN_ENCARGADO: '1234' } });
  g.ctx.instalar();
  return g;
}
const celda = (g, hoja, fila, col) => g.hoja(hoja).filas[fila - 1][col - 1];

test('instalar crea SOLYMAR, MINAS e HISTORIAL y es idempotente', () => {
  const g = montar();
  g.post({ ...base, accion: 'sumar', id: 'a', sector: 'deposito', cod: '330001', cantidad: 2 });
  g.ctx.instalar();
  assert.deepEqual(g.ss.hojas.map(h => h.nombre), ['SOLYMAR', 'MINAS', 'HISTORIAL']);
  assert.equal(celda(g, 'MINAS', 1, 6), 'LOCAL MINAS');
  assert.equal(celda(g, 'MINAS', 4, 6), '');
  assert.equal(celda(g, 'SOLYMAR', 2, 5), 2);
  assert.equal(g.hoja('HISTORIAL').filas.length, 2);
});

test('catalogo agrupa y trae el conteo', () => {
  const r = montar().post({ accion: 'catalogo', sucursal: 'solymar' });
  assert.equal(r.ok, true);
  assert.equal(r.articulos.length, 2);
  assert.equal(r.articulos[1].salon, 4);
  assert.equal(r.conteo, 'inicial');
  assert.equal('fila' in r.articulos[0], false);
});

test('sumar dos veces suma y registra', () => {
  const g = montar();
  g.post({ ...base, accion: 'sumar', id: 'a', sector: 'deposito', cod: '330001', cantidad: 5 });
  const r = g.post({ ...base, accion: 'sumar', id: 'b', sector: 'deposito', cod: '7730171681014', cantidad: 7 });
  assert.equal(r.articulo.deposito, 12);
  assert.equal(celda(g, 'SOLYMAR', 2, 5), 12);
  const h = g.hoja('HISTORIAL').filas;
  assert.equal(h.length, 3);
  assert.deepEqual([h[2][6], h[2][7], h[2][8], h[2][9], h[2][10]], ['sumar', 7, 5, 12, 'Ana']);
});

test('mismo id dos veces no suma dos veces', () => {
  const g = montar();
  const op = { ...base, accion: 'sumar', id: 'a', sector: 'deposito', cod: '330001', cantidad: 5 };
  g.post(op);
  const r = g.post(op);
  assert.equal(r.repetido, true);
  assert.equal(r.articulo.deposito, 5);
  assert.equal(g.hoja('HISTORIAL').filas.length, 2);
});

test('repetido: escribe en la primera fila y consolida las demas', () => {
  const g = montar();
  const r = g.post({ ...base, accion: 'sumar', id: 'a', sector: 'salon', cod: '330056', cantidad: 1 });
  assert.equal(r.articulo.salon, 5);
  assert.equal(celda(g, 'SOLYMAR', 3, 6), 5);
  assert.equal(celda(g, 'SOLYMAR', 4, 6), '');
});

test('corregir a cero deja 0, no vacio, y deshacer vuelve', () => {
  const g = montar();
  g.post({ ...base, accion: 'sumar', id: 'a', sector: 'deposito', cod: '330001', cantidad: 12 });
  g.post({ ...base, accion: 'corregir', id: 'b', sector: 'deposito', cod: '330001', valor: 0 });
  assert.equal(celda(g, 'SOLYMAR', 2, 5), 0);
  const r = g.post({ accion: 'deshacer', id: 'c', idOriginal: 'b', usuario: 'Ana' });
  assert.equal(r.ok, true);
  assert.equal(celda(g, 'SOLYMAR', 2, 5), 12);
  assert.equal(g.hoja('HISTORIAL').filas[2][12], 'deshecho');
  const otra = g.post({ accion: 'deshacer', id: 'd', idOriginal: 'b', usuario: 'Ana' });
  assert.equal(otra.codigo, 'DATOS_INVALIDOS');
});

test('deshacer corregir con valor cambiado -> CONFLICTO', () => {
  const g = montar();
  g.post({ ...base, accion: 'corregir', id: 'a', sector: 'deposito', cod: '330001', valor: 10 });
  g.post({ ...base, accion: 'sumar', id: 'b', sector: 'deposito', cod: '330001', cantidad: 1 });
  assert.equal(g.post({ accion: 'deshacer', id: 'c', idOriginal: 'a', usuario: 'Ana' }).codigo, 'CONFLICTO');
});

test('comentar y proteger contra formulas', () => {
  const g = montar();
  const r = g.post({ ...base, accion: 'comentar', id: 'a', cod: '330001', texto: '=HOLA()' });
  assert.equal(r.articulo.comentario, '=HOLA()');
  g.post({ accion: 'deshacer', id: 'b', idOriginal: 'a', usuario: 'Ana' });
  assert.equal(celda(g, 'SOLYMAR', 2, 9), '');
});

test('codigo desconocido y datos invalidos', () => {
  const g = montar();
  assert.equal(g.post({ ...base, accion: 'sumar', id: 'a', sector: 'deposito', cod: '999', cantidad: 1 }).codigo, 'ARTICULO_NO_ENCONTRADO');
  assert.equal(g.post({ ...base, accion: 'sumar', id: 'b', sector: 'deposito', cod: '330001', cantidad: 1.5 }).codigo, 'DATOS_INVALIDOS');
  assert.equal(g.post({ accion: 'borrarTodo' }).codigo, 'DATOS_INVALIDOS');
});

test('minas no toca solymar', () => {
  const g = montar();
  g.post({ ...base, sucursal: 'minas', accion: 'sumar', id: 'a', sector: 'salon', cod: '330001', cantidad: 3 });
  assert.equal(celda(g, 'MINAS', 2, 6), 3);
  assert.equal(celda(g, 'SOLYMAR', 2, 6), '');
});

test('historial filtra por usuario y sucursal, mas nuevas primero', () => {
  const g = montar();
  g.post({ ...base, accion: 'sumar', id: 'a', sector: 'deposito', cod: '330001', cantidad: 1 });
  g.post({ ...base, usuario: 'Beto', accion: 'sumar', id: 'b', sector: 'deposito', cod: '330001', cantidad: 1 });
  g.post({ ...base, accion: 'sumar', id: 'c', sector: 'salon', cod: '330001', cantidad: 1 });
  const r = g.post({ accion: 'historial', sucursal: 'solymar', usuario: 'Ana' });
  assert.deepEqual(r.cargas.map(c => c.id), ['c', 'a']);
  assert.equal(typeof r.cargas[0].fecha_hora, 'string');
});

test('nuevo conteo: pin, archivo, limpieza y bloqueo de deshacer viejo', () => {
  const g = montar();
  g.post({ ...base, accion: 'sumar', id: 'a', sector: 'deposito', cod: '330001', cantidad: 4 });
  assert.equal(g.post({ ...base, accion: 'nuevoConteo', pin: '0000' }).codigo, 'PIN_INCORRECTO');
  const r = g.post({ ...base, accion: 'nuevoConteo', pin: '1234' });
  assert.equal(r.archivo, 'SOLYMAR 23-10-2026 14.30');
  assert.equal(g.hoja('SOLYMAR 23-10-2026 14.30').filas[1][4], 4);
  assert.equal(celda(g, 'SOLYMAR', 2, 5), '');
  assert.equal(g.post({ accion: 'catalogo', sucursal: 'solymar' }).conteo, '23-10-2026 14.30');
  assert.equal(g.post({ accion: 'deshacer', id: 'z', idOriginal: 'a', usuario: 'Ana' }).codigo, 'DATOS_INVALIDOS');
  assert.equal(g.post({ accion: 'historial', sucursal: 'solymar' }).cargas.length, 0);
});

test('sin PIN configurado nadie puede reiniciar', () => {
  const g = crearGas({ hojas: { 'Hoja 1': FILAS() } });
  g.ctx.instalar();
  assert.equal(g.post({ ...base, accion: 'nuevoConteo', pin: '' }).codigo, 'PIN_INCORRECTO');
});
