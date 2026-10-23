// Catálogo: índice por código, búsqueda y filtros. Lógica pura, sin DOM.

export function normalizarCodigo(s) {
  // Sin espacios, sin caracteres de control (algunos lectores mandan GS o Enter) y sin ceros adelante.
  return String(s ?? '').replace(/[\s\x00-\x1f\x7f]+/g, '').replace(/^0+/, '');
}

// Algunos lectores anteponen el identificador AIM de la simbología: "]C1" (Code 128), "]E0" (EAN)…
// Son 3 caracteres, pero hay lectores que mandan solo "]C". Se prueban las dos formas.
const AIM = /^\][A-Za-z]/;
function variantes(leido) {
  const s = String(leido ?? '').replace(/[\s\x00-\x1f\x7f]+/g, '');
  return AIM.test(s) ? [s.slice(3), s.slice(2)] : [s];
}

export function esCodigoLeido(texto) {
  return variantes(texto).some(v => /^\d{4,}$/.test(v));
}

const sinAcentos = s => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function crearIndice(articulos) {
  const indice = new Map();
  for (const a of articulos) {
    for (const c of [a.cod, ...a.codigos]) {
      const k = normalizarCodigo(c);
      if (k && !indice.has(k)) indice.set(k, a);
    }
  }
  return indice;
}

export function buscarPorCodigo(indice, leido) {
  for (const v of variantes(leido)) {
    const k = normalizarCodigo(v);
    if (k && indice.has(k)) return indice.get(k);
  }
  return null;
}

export function buscarTexto(articulos, texto, limite = 50) {
  const q = sinAcentos(texto).trim();
  if (!q) return [];
  const palabras = q.split(/\s+/);
  const codigo = normalizarCodigo(q);
  const esCodigo = /^\d+$/.test(q.replace(/\s+/g, ''));
  const out = [];
  for (const a of articulos) {
    const porCodigo = esCodigo && codigo &&
      [a.cod, ...a.codigos].some(c => normalizarCodigo(c).startsWith(codigo));
    const desc = sinAcentos(a.desc);
    if (porCodigo || palabras.every(p => desc.includes(p))) {
      out.push(a);
      if (out.length >= limite) break;
    }
  }
  return out;
}

export function filtrar(articulos, filtro, sector) {
  switch (filtro) {
    case 'contados': return articulos.filter(a => a[sector] !== null);
    case 'sinContar': return articulos.filter(a => a[sector] === null);
    case 'comentados': return articulos.filter(a => a.comentario);
    default: return articulos;
  }
}

export function avance(articulos, sector) {
  let contados = 0;
  for (const a of articulos) if (a[sector] !== null) contados++;
  return { contados, total: articulos.length };
}

export function total(a) {
  if (a.deposito === null && a.salon === null) return null;
  return (a.deposito ?? 0) + (a.salon ?? 0);
}
