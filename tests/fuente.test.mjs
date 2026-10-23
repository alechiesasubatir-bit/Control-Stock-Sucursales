import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limpiarSiCambioFuente } from '../js/fuente.js';

function almacen(inicial) {
  const m = new Map(Object.entries(inicial));
  return {
    m,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    key: i => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

test('al cambiar de planilla se borran cola, cargas, catalogos y conteos, no las preferencias', () => {
  const s = almacen({
    'css.fuente': '"https://viejo"', 'css.cola': '[{"id":"x"}]', 'css.cargas': '[1]', 'css.conteos': '{}',
    'css.catalogo.solymar': '{}', 'css.catalogo.minas': '{}',
    'css.usuario': '"Ana"', 'css.sucursal': '"solymar"', 'css.sector': '"salon"', 'otra.app': '1',
  });
  assert.equal(limpiarSiCambioFuente('https://nuevo', s), true);
  assert.deepEqual([...s.m.keys()].sort(), ['css.fuente', 'css.sector', 'css.sucursal', 'css.usuario', 'otra.app']);
  assert.equal(s.getItem('css.fuente'), '"https://nuevo"');
});

test('misma planilla: no toca nada', () => {
  const s = almacen({ 'css.fuente': '"https://a"', 'css.cola': '[{"id":"x"}]' });
  assert.equal(limpiarSiCambioFuente('https://a', s), false);
  assert.equal(s.getItem('css.cola'), '[{"id":"x"}]');
});

test('celular que nunca guardo fuente (version anterior) se limpia', () => {
  const s = almacen({ 'css.cola': '[{"id":"x"}]', 'css.usuario': '"Ana"' });
  assert.equal(limpiarSiCambioFuente('https://a', s), true);
  assert.equal(s.getItem('css.cola'), null);
  assert.equal(s.getItem('css.usuario'), '"Ana"');
});

test('sin almacenamiento no explota', () => {
  assert.equal(limpiarSiCambioFuente('https://a', undefined), false);
});
