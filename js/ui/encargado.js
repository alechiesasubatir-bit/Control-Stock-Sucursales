// Encargado: resumen del conteo y Nuevo conteo. El PIN lo valida el script, nunca la app.
import { estado, aviso, cargarCatalogo, NOMBRES } from '../estado.js';
import { avance, filtrar } from '../catalogo.js';
import { llamar, ErrorRed } from '../api.js';

export function initEncargado() {
  const $ = id => document.getElementById(id);
  const pin = $('pin');
  const texto = $('nc-texto');
  const ejecutar = $('nc-ejecutar');
  let pinIngresado = '';

  const palabra = () => (NOMBRES[estado.sucursal] || '').toUpperCase();

  function sacudir() {
    pin.classList.remove('sacudir'); void pin.offsetWidth; pin.classList.add('sacudir');
    navigator.vibrate?.([30, 50, 30]);
  }

  function mostrarPin() {
    $('encargado-pin').hidden = false;
    $('encargado-panel').hidden = true;
    pin.value = '';
    pinIngresado = '';
  }

  function mostrarPanel() {
    const d = avance(estado.articulos, 'deposito');
    const s = avance(estado.articulos, 'salon');
    const pct = (a) => a.total ? Math.round(a.contados / a.total * 100) + '%' : '—';
    $('encargado-resumen').innerHTML = `
      <div><b>${d.contados.toLocaleString('es-UY')}</b><span>contados en Depósito (${pct(d)})</span></div>
      <div><b>${s.contados.toLocaleString('es-UY')}</b><span>contados en Salón (${pct(s)})</span></div>
      <div><b>${filtrar(estado.articulos, 'comentados').length.toLocaleString('es-UY')}</b><span>con comentario</span></div>
      <div><b>${d.total.toLocaleString('es-UY')}</b><span>artículos en la lista</span></div>`;
    $('nc-pestana').textContent = palabra();
    $('nc-palabra').textContent = palabra();
    $('nc-confirmar').hidden = true;
    $('nc-iniciar').hidden = false;
    texto.value = '';
    ejecutar.disabled = true;
    $('encargado-pin').hidden = true;
    $('encargado-panel').hidden = false;
  }

  $('pin-entrar').addEventListener('click', () => {
    if (pin.value.trim().length < 4) { sacudir(); return; }
    pinIngresado = pin.value.trim();
    mostrarPanel();
  });
  pin.addEventListener('keydown', e => { if (e.key === 'Enter') $('pin-entrar').click(); });
  pin.addEventListener('animationend', () => pin.classList.remove('sacudir'));

  $('nc-iniciar').addEventListener('click', () => {
    $('nc-iniciar').hidden = true;
    $('nc-confirmar').hidden = false;
    texto.focus();
  });
  texto.addEventListener('input', () => { ejecutar.disabled = texto.value.trim().toUpperCase() !== palabra(); });

  ejecutar.addEventListener('click', async () => {
    ejecutar.disabled = true;
    ejecutar.textContent = 'Archivando…';
    try {
      const r = await llamar({ accion: 'nuevoConteo', sucursal: estado.sucursal, pin: pinIngresado, usuario: estado.usuario }, { timeout: 60000 });
      if (r.ok) {
        aviso(`Listo. El conteo anterior quedó en la pestaña “${r.archivo}”.`, 'ok');
        await cargarCatalogo();
        mostrarPanel();
      } else if (r.codigo === 'PIN_INCORRECTO') {
        aviso('El PIN no es correcto.', 'error');
        mostrarPin();
        sacudir();
      } else {
        aviso('No se pudo: ' + (r.error || r.codigo), 'error');
        ejecutar.disabled = false;
      }
    } catch (e) {
      aviso(e instanceof ErrorRed ? 'Hace falta conexión para empezar un nuevo conteo.' : 'No se pudo: ' + e.message, 'error');
      ejecutar.disabled = false;
    } finally {
      ejecutar.textContent = 'Archivar y poner en blanco';
    }
  });

  return {
    mostrar() { if (pinIngresado) mostrarPanel(); else mostrarPin(); },
    ocultar() { pinIngresado = ''; },
  };
}
