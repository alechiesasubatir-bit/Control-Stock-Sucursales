// Navegación entre pantallas. Cada pantalla se registra con {mostrar()}.
const pantallas = {};
let actual = null;
const $ = id => document.getElementById(id);

export const pantallaActual = () => actual;
export function registrarPantalla(nombre, api) { pantallas[nombre] = api; }

export function ir(nombre) {
  if (nombre === actual) { pantallas[nombre]?.mostrar?.(); return; }
  document.querySelectorAll('.pantalla').forEach(p => { p.hidden = p.dataset.p !== nombre; p.classList.remove('entra'); });
  const p = document.querySelector(`.pantalla[data-p="${nombre}"]`);
  void p.offsetWidth;
  p.classList.add('entra');
  const trabajo = nombre !== 'ingreso';
  $('encabezado').hidden = !trabajo;
  $('barra').hidden = !trabajo;
  document.querySelectorAll('.barra [data-ir]').forEach(b => {
    if (b.dataset.ir === nombre) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  window.scrollTo({ top: 0 });
  if (actual) pantallas[actual]?.ocultar?.();
  actual = nombre;
  pantallas[nombre]?.mostrar?.();
}
