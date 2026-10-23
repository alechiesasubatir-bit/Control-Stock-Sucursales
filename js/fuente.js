// Si la app pasa a apuntar a otra planilla (por ejemplo, de la copia de prueba a la real),
// lo guardado en el celular es de la otra planilla: cargas pendientes, Mis cargas y catálogos.
// Se borra para que nada de la prueba termine escrito en la real. Nombre, sucursal y sector se conservan.
const CONSERVAR = new Set(['css.usuario', 'css.sucursal', 'css.sector', 'css.fuente']);

export function limpiarSiCambioFuente(url, almacen = globalThis.localStorage) {
  try {
    if (!almacen) return false;
    const actual = JSON.stringify(url);
    if (almacen.getItem('css.fuente') === actual) return false;
    const borrar = [];
    for (let i = 0; i < almacen.length; i++) {
      const k = almacen.key(i);
      if (k && k.startsWith('css.') && !CONSERVAR.has(k)) borrar.push(k);
    }
    borrar.forEach(k => almacen.removeItem(k));
    almacen.setItem('css.fuente', actual);
    return true;
  } catch {
    return false;
  }
}
