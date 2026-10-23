import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearCola } from '../js/cola.js';

class ErrorRed extends Error { constructor() { super('red'); this.name = 'ErrorRed'; } }

function armar({ respuestas = [], inicial = [] } = {}) {
  const enviados = [], esperas = [], guardados = [];
  let reintento = null;
  const cola = crearCola({
    enviar: async op => {
      enviados.push(op.id);
      const r = respuestas.length ? respuestas.shift() : { ok: true };
      if (r instanceof Error) throw r;
      return r;
    },
    guardar: lista => guardados.push(lista.map(o => o.id)),
    cargar: () => inicial,
    esperar: (ms, fn) => { esperas.push(ms); reintento = fn; },
  });
  return { cola, enviados, esperas, guardados, reintentar: () => reintento() };
}

test('envia en orden y vacia', async () => {
  const t = armar();
  t.cola.agregar({ id: 'a' }); t.cola.agregar({ id: 'b' });
  await t.cola.procesar();
  assert.deepEqual(t.enviados, ['a', 'b']);
  assert.deepEqual(t.cola.pendientes(), []);
  assert.deepEqual(t.guardados.at(-1), []);
});

test('error de red conserva la op y reintenta con espera creciente', async () => {
  const t = armar({ respuestas: [new ErrorRed(), new ErrorRed(), new ErrorRed()] });
  t.cola.agregar({ id: 'a' });
  await t.cola.procesar();
  await t.reintentar();
  await t.reintentar();
  assert.deepEqual(t.esperas, [2000, 4000, 8000]);
  assert.deepEqual(t.cola.pendientes().map(o => o.id), ['a']);
});

test('la espera tiene tope de 60 s y un exito la reinicia', async () => {
  const t = armar({ respuestas: Array.from({ length: 7 }, () => new ErrorRed()) });
  t.cola.agregar({ id: 'a' });
  await t.cola.procesar();
  for (let i = 0; i < 6; i++) await t.reintentar();
  assert.equal(t.esperas.at(-1), 60000);
  await t.reintentar();
  t.cola.agregar({ id: 'b' });
  await t.cola.procesar();
  assert.deepEqual(t.cola.pendientes(), []);
  const u = armar({ respuestas: [new ErrorRed(), { ok: true }, new ErrorRed()] });
  u.cola.agregar({ id: 'x' }); u.cola.agregar({ id: 'y' });
  await u.cola.procesar(); await u.reintentar();
  assert.deepEqual(u.esperas, [2000, 2000]);
});

test('OCUPADO se reintenta como un error de red', async () => {
  const t = armar({ respuestas: [{ ok: false, codigo: 'OCUPADO' }] });
  t.cola.agregar({ id: 'a' });
  await t.cola.procesar();
  assert.deepEqual(t.esperas, [2000]);
  assert.equal(t.cola.pendientes().length, 1);
});

test('error de datos saca la op y avisa', async () => {
  const t = armar({ respuestas: [{ ok: false, codigo: 'DATOS_INVALIDOS', error: 'x' }] });
  const errores = [];
  t.cola.onError((op, r) => errores.push([op.id, r.codigo]));
  t.cola.agregar({ id: 'a' }); t.cola.agregar({ id: 'b' });
  await t.cola.procesar();
  assert.deepEqual(errores, [['a', 'DATOS_INVALIDOS']]);
  assert.deepEqual(t.enviados, ['a', 'b']);
  assert.deepEqual(t.cola.pendientes(), []);
});

test('avisa cada resultado ok', async () => {
  const t = armar({ respuestas: [{ ok: true, articulo: { cod: '1' } }] });
  const res = [];
  t.cola.onResultado((op, r) => res.push([op.id, r.articulo.cod]));
  t.cola.agregar({ id: 'a' });
  await t.cola.procesar();
  assert.deepEqual(res, [['a', '1']]);
});

test('reintento manda el mismo id', async () => {
  const t = armar({ respuestas: [new ErrorRed(), { ok: true }] });
  t.cola.agregar({ id: 'a' });
  await t.cola.procesar();
  await t.reintentar();
  assert.deepEqual(t.enviados, ['a', 'a']);
});

test('procesar concurrente no duplica', async () => {
  const t = armar();
  t.cola.agregar({ id: 'a' }); t.cola.agregar({ id: 'b' });
  await Promise.all([t.cola.procesar(), t.cola.procesar()]);
  assert.deepEqual(t.enviados, ['a', 'b']);
});

test('persiste y recupera', async () => {
  const t = armar({ inicial: [{ id: 'p' }] });
  assert.deepEqual(t.cola.pendientes().map(o => o.id), ['p']);
  t.cola.agregar({ id: 'q' });
  assert.deepEqual(t.guardados.at(-1), ['p', 'q']);
});

test('quitar saca una pendiente sin enviarla', async () => {
  const t = armar();
  const cambios = [];
  t.cola.onCambio(n => cambios.push(n));
  t.cola.agregar({ id: 'a' }); t.cola.agregar({ id: 'b' });
  assert.equal(t.cola.quitar('a'), true);
  assert.equal(t.cola.quitar('zz'), false);
  await t.cola.procesar();
  assert.deepEqual(t.enviados, ['b']);
  assert.deepEqual(cambios, [1, 2, 1, 0]);
});
