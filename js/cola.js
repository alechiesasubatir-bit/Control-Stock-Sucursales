// Cola de cargas: se mandan en orden, una a la vez, y sobreviven a un corte de señal.
// Las dependencias vienen de afuera para poder probarla sin red ni navegador.

const ESPERA_INICIAL = 2000;
const ESPERA_MAXIMA = 60000;
const TRANSITORIOS = new Set(['OCUPADO']);

export function crearCola({ enviar, guardar, cargar, esperar = (ms, fn) => setTimeout(fn, ms) }) {
  let lista = [];
  try { lista = (cargar() || []).slice(); } catch { lista = []; }
  let fallos = 0;
  let enCurso = null;
  let enviando = null;
  let reintentoProgramado = false;
  const oyentes = { resultado: [], error: [], cambio: [] };
  const emitir = (tipo, ...args) => oyentes[tipo].forEach(fn => fn(...args));

  const persistir = () => {
    try { guardar(lista); } catch { /* sin almacenamiento: la cola sigue en memoria */ }
    emitir('cambio', lista.length);
  };

  const programarReintento = () => {
    fallos++;
    if (reintentoProgramado) return;
    reintentoProgramado = true;
    const ms = Math.min(ESPERA_INICIAL * 2 ** (fallos - 1), ESPERA_MAXIMA);
    esperar(ms, () => { reintentoProgramado = false; return procesar(); });
  };

  async function vaciar() {
    while (lista.length) {
      const op = lista[0];
      enviando = op.id;
      let resp;
      try {
        resp = await enviar(op);
      } catch {
        enviando = null;
        programarReintento();
        return;
      }
      enviando = null;
      if (resp && resp.ok === false && TRANSITORIOS.has(resp.codigo)) {
        programarReintento();
        return;
      }
      fallos = 0;
      lista.shift();
      persistir();
      if (resp && resp.ok) emitir('resultado', op, resp);
      else emitir('error', op, resp || { ok: false, codigo: 'ERROR', error: 'respuesta vacía' });
    }
  }

  function procesar() {
    if (!enCurso) enCurso = vaciar().finally(() => { enCurso = null; });
    return enCurso;
  }

  return {
    agregar(op) { lista.push(op); persistir(); },
    pendientes: () => lista.slice(),
    quitar(id) {
      const i = lista.findIndex(o => o.id === id);
      if (i === -1 || id === enviando) return false;
      lista.splice(i, 1);
      persistir();
      return true;
    },
    procesar,
    onResultado: fn => oyentes.resultado.push(fn),
    onError: fn => oyentes.error.push(fn),
    onCambio: fn => oyentes.cambio.push(fn),
  };
}
