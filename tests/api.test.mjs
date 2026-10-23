import { test } from 'node:test';
import assert from 'node:assert/strict';
import { llamar, ErrorRed } from '../js/api.js';

test('devuelve el json tal cual, tambien ok:false', async () => {
  let pedido;
  globalThis.fetch = async (url, op) => { pedido = op; return { text: async () => '{"ok":false,"codigo":"CONFLICTO"}' }; };
  assert.deepEqual(await llamar({ accion: 'x' }, { url: 'u' }), { ok: false, codigo: 'CONFLICTO' });
  assert.equal(pedido.method, 'POST');
  assert.equal(pedido.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.equal(pedido.body, '{"accion":"x"}');
});
test('respuesta que no es json -> ErrorRed', async () => {
  globalThis.fetch = async () => ({ text: async () => '<html>login</html>' });
  await assert.rejects(llamar({}, { url: 'u' }), ErrorRed);
});
test('fallo de red -> ErrorRed', async () => {
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(llamar({}, { url: 'u' }), ErrorRed);
});
test('timeout -> ErrorRed', async () => {
  globalThis.fetch = (u, op) => new Promise((_, rej) => op.signal.addEventListener('abort', () => rej(new Error('abort'))));
  await assert.rejects(llamar({}, { url: 'u', timeout: 20 }), ErrorRed);
});
test('sin url configurada -> ErrorRed', async () => {
  await assert.rejects(llamar({}, { url: '' }), ErrorRed);
});
