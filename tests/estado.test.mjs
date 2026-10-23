// Estado del celular contra un servidor falso: refrescos del catálogo mezclados con cargas en vuelo.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const almacen = new Map([['css.sucursal', '"solymar"'], ['css.usuario', '"Ana"']]);
globalThis.localStorage = {
  getItem: k => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => almacen.set(k, String(v)),
  removeItem: k => almacen.delete(k),
};

// Cada pedido queda esperando hasta que el test le responde.
const pedidos = [];
globalThis.fetch = (url, op) => new Promise(res => {
  pedidos.push({ cuerpo: JSON.parse(op.body), responder: obj => res({ text: async () => JSON.stringify(obj) }) });
});
(await import('../js/api.js')).fijarUrl('https://falso');
const E = await import('../js/estado.js');

const tick = () => new Promise(r => setTimeout(r, 0));
async function tomar(accion) {
  for (let i = 0; i < 100; i++) {
    const j = pedidos.findIndex(p => p.cuerpo.accion === accion);
    if (j !== -1) return pedidos.splice(j, 1)[0];
    await tick();
  }
  throw new Error('no llegó el pedido ' + accion);
}
const art = dep => ({ cod: 'A', codigos: [], desc: 'Art', precio: 1, deposito: dep, salon: null, comentario: '' });
const catalogo = (dep, aplicados = []) => ({ ok: true, articulos: [art(dep)], conteo: 'inicial', aplicados });
const dep = () => E.estado.porCod.get('A').deposito;

test('carga inicial', async () => {
  const c = E.cargarCatalogo();
  (await tomar('catalogo')).responder(catalogo(3));
  await c;
  assert.equal(dep(), 3);
});

test('I1a: un catalogo viejo que llega despues del resultado no baja el numero', async () => {
  const c = E.cargarCatalogo();
  const pedidoCat = await tomar('catalogo');           // se leyó antes de la escritura
  E.registrarCarga({ accion: 'sumar', sector: 'deposito', cod: 'A', cantidad: 12 });
  assert.equal(dep(), 15);
  (await tomar('sumar')).responder({ ok: true, articulo: art(15) });
  await E.cola.procesar();
  pedidoCat.responder(catalogo(3));
  await c;
  assert.equal(dep(), 15);
});

test('I1b: una carga en vuelo que el servidor ya aplico no se muestra dos veces', async () => {
  const op = E.registrarCarga({ accion: 'sumar', sector: 'deposito', cod: 'A', cantidad: 5 });
  const pedidoSumar = await tomar('sumar');            // salió, sin respuesta todavía
  assert.equal(dep(), 20);
  const c = E.cargarCatalogo();
  const pedidoCat = await tomar('catalogo');
  assert.deepEqual(pedidoCat.cuerpo.pendientes, [op.id]);
  pedidoCat.responder(catalogo(20, [op.id]));
  await c;
  assert.equal(dep(), 20);
  pedidoSumar.responder({ ok: true, articulo: art(20) });
  await E.cola.procesar();
  assert.equal(dep(), 20);
});

test('I1c: la cache guarda lo confirmado por el servidor, sin las cargas pendientes', async () => {
  E.registrarCarga({ accion: 'sumar', sector: 'deposito', cod: 'A', cantidad: 1 });
  const enVuelo = await tomar('sumar');
  assert.equal(dep(), 21);
  const cache = JSON.parse(almacen.get('css.catalogo.solymar'));
  assert.equal(cache.articulos.find(a => a.cod === 'A').deposito, 20);
  enVuelo.responder({ ok: true, articulo: art(21) });
  await E.cola.procesar();
  assert.equal(JSON.parse(almacen.get('css.catalogo.solymar')).articulos[0].deposito, 21);
});
