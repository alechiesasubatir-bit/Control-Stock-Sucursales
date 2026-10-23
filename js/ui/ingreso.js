// Pantalla de ingreso: sucursal + nombre, una sola vez por celular.
import { estado, guardarPreferencias } from '../estado.js';
import { logoSVG } from '../logo.js';

export function initIngreso({ alEntrar }) {
  const raiz = document.querySelector('[data-p="ingreso"]');
  const nombre = document.getElementById('ingreso-nombre');
  const empezar = document.getElementById('ingreso-empezar');
  const tarjetas = raiz.querySelectorAll('.sucursal');
  let elegida = estado.sucursal;

  const validar = () => { empezar.disabled = !(elegida && nombre.value.trim().length >= 2); };
  const marcar = () => tarjetas.forEach(t => t.setAttribute('aria-checked', String(t.dataset.sucursal === elegida)));

  tarjetas.forEach(t => t.addEventListener('click', () => {
    elegida = t.dataset.sucursal;
    marcar();
    validar();
    navigator.vibrate?.(10);
    if (!nombre.value) nombre.focus();
  }));
  nombre.addEventListener('input', validar);
  nombre.addEventListener('keydown', e => { if (e.key === 'Enter' && !empezar.disabled) empezar.click(); });
  empezar.addEventListener('click', () => {
    const cambio = elegida !== estado.sucursal;
    estado.usuario = nombre.value.trim().replace(/\s+/g, ' ');
    estado.sucursal = elegida;
    guardarPreferencias();
    alEntrar({ cambioSucursal: cambio });
  });

  return {
    mostrar() {
      document.getElementById('ingreso-logo').innerHTML = logoSVG({ animado: true });
      nombre.value = estado.usuario;
      elegida = estado.sucursal;
      marcar();
      validar();
    },
  };
}
