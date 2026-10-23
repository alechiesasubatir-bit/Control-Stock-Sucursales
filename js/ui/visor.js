// Visor de cámara a pantalla completa.
import { estado, emitir, aviso } from '../estado.js';
import { buscarPorCodigo } from '../catalogo.js';
import { iniciarEscaner } from '../escaner.js';

let audio = null;
function bip() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume?.();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.18, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.09);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.09);
  } catch { /* sin audio */ }
}

export function initVisor({ buscarAMano }) {
  const $ = id => document.getElementById(id);
  const visor = $('visor');
  const linterna = $('visor-linterna');
  const error = $('visor-error');
  let escaner = null;
  let abierto = false;

  function cerrar() {
    abierto = false;
    escaner?.detener();
    escaner = null;
    visor.hidden = true;
    visor.classList.remove('leido');
    linterna.setAttribute('aria-pressed', 'false');
    document.body.style.overflow = '';
  }

  function alLeer(codigo) {
    if (!abierto) return;
    const art = buscarPorCodigo(estado.indice, codigo);
    navigator.vibrate?.(art ? 40 : [30, 60, 30]);
    bip();
    visor.classList.add('leido');
    setTimeout(() => {
      cerrar();
      if (art) emitir('abrirFicha', { articulo: art, desdeVisor: true });
      else {
        aviso(`El código ${codigo} no está en la lista. Buscalo por nombre.`, 'error');
        buscarAMano(codigo);
      }
    }, 220);
  }

  async function abrir() {
    if (abierto) return;
    abierto = true;
    // El audio se habilita con este toque; si no, el primer bip sale mudo en iPhone.
    try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); } catch { /* sin audio */ }
    visor.hidden = false;
    error.hidden = true;
    linterna.hidden = true;
    document.body.style.overflow = 'hidden';
    try {
      escaner = await iniciarEscaner($('visor-video'), alLeer);
      if (!abierto) { escaner.detener(); escaner = null; return; }
      linterna.hidden = !escaner.tieneLinterna;
    } catch (e) {
      error.hidden = false;
      error.innerHTML = e.message === 'SIN_CAMARA'
        ? '<p>No se pudo abrir la cámara. Revisá que el navegador tenga permiso para usarla (candado junto a la dirección → Cámara → Permitir).</p><button class="boton boton-principal boton-ancho" data-a="buscar">Buscar a mano</button>'
        : '<p>No se pudo cargar el lector de códigos. Revisá la conexión.</p><button class="boton boton-principal boton-ancho" data-a="buscar">Buscar a mano</button>';
    }
  }

  linterna.addEventListener('click', async () => {
    const on = linterna.getAttribute('aria-pressed') !== 'true';
    if (await escaner?.linterna(on)) linterna.setAttribute('aria-pressed', String(on));
  });
  $('visor-cerrar').addEventListener('click', cerrar);
  $('visor-buscar').addEventListener('click', () => { cerrar(); buscarAMano(''); });
  error.addEventListener('click', e => { if (e.target.closest('[data-a="buscar"]')) { cerrar(); buscarAMano(''); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && abierto) cerrar(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && abierto) cerrar(); });

  return { abrir, cerrar };
}
