// Catálogo: índice por código, búsqueda y filtros. Lógica pura, sin DOM.

export function normalizarCodigo(s) {
  return String(s ?? '').replace(/\s+/g, '').replace(/^0+/, '');
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
  const k = normalizarCodigo(leido);
  return (k && indice.get(k)) || null;
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
