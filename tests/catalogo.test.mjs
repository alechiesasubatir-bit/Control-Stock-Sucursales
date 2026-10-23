import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/catalogo.js';

const A = [
  { cod: '330056', codigos: ['4056807558707', '7891799092450'], desc: 'Antiempañante 60 ml. WURTH', precio: 432, deposito: 3, salon: null, comentario: '' },
  { cod: '330004', codigos: ['915120013255'], desc: 'Acido Citrico x 1 Kg', precio: 277, deposito: null, salon: null, comentario: 'vence pronto' },
  { cod: '210210', codigos: [], desc: 'Agua Lavandina x 10 lts.', precio: 359, deposito: 0, salon: 2, comentario: '' },
];

test('normaliza ceros y espacios', () => {
  assert.equal(C.normalizarCodigo(' 0915120013255 '), '915120013255');
  assert.equal(C.normalizarCodigo('000'), '');
});
test('UPC-A leido como EAN-13 encuentra el articulo', () => {
  assert.equal(C.buscarPorCodigo(C.crearIndice(A), '0915120013255').cod, '330004');
});
test('cualquier alternativo y el cod art encuentran el mismo articulo', () => {
  const i = C.crearIndice(A);
  assert.equal(C.buscarPorCodigo(i, '7891799092450').cod, '330056');
  assert.equal(C.buscarPorCodigo(i, '330056').cod, '330056');
});
test('codigo desconocido devuelve null', () => {
  assert.equal(C.buscarPorCodigo(C.crearIndice(A), '123'), null);
});
test('busqueda sin acentos y por palabras', () => {
  assert.deepEqual(C.buscarTexto(A, 'antiempanante wurth').map(a => a.cod), ['330056']);
});
test('busqueda por prefijo de codigo', () => {
  assert.deepEqual(C.buscarTexto(A, '2102').map(a => a.cod), ['210210']);
});
test('cero cuenta como contado, null no', () => {
  assert.deepEqual(C.filtrar(A, 'contados', 'deposito').map(a => a.cod), ['330056', '210210']);
  assert.deepEqual(C.avance(A, 'salon'), { contados: 1, total: 3 });
});
test('filtro sin contar', () => {
  assert.deepEqual(C.filtrar(A, 'sinContar', 'deposito').map(a => a.cod), ['330004']);
});
test('filtro comentados', () => {
  assert.deepEqual(C.filtrar(A, 'comentados', 'deposito').map(a => a.cod), ['330004']);
});
test('total', () => {
  assert.equal(C.total(A[0]), 3);
  assert.equal(C.total(A[1]), null);
  assert.equal(C.total(A[2]), 2);
});
