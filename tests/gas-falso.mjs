// Planilla falsa en memoria con el subconjunto de la API de Apps Script que usa Code.gs.
import fs from 'node:fs';
import vm from 'node:vm';

// Como Sheets: un texto que parece número o fecha se convierte, salvo que empiece con apóstrofo,
// que fuerza texto y no se guarda.
function convertir(v) {
  if (typeof v !== 'string') return v;
  if (v.startsWith("'")) return v.slice(1);
  if (/^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  if (/^\d{1,2}[-/]\d{1,2}([-/]\d{2,4})?(\s|$)/.test(v.trim())) return new Date(2026, 0, 1);
  return v;
}

class Hoja {
  constructor(nombre, filas) { this.nombre = nombre; this.filas = filas.map(f => f.slice()); }
  getName() { return this.nombre; }
  setName(n) { this.nombre = n; return this; }
  getLastRow() { return this.filas.length; }
  getLastColumn() { return Math.max(0, ...this.filas.map(f => f.length)); }
  getDataRange() { return this.getRange(1, 1, this.getLastRow(), this.getLastColumn()); }
  appendRow(f) { this.filas.push(f.map(convertir)); }
  setFrozenRows() {}
  copyTo(ss) { const h = new Hoja('Copia de ' + this.nombre, this.filas); ss.hojas.push(h); return h; }
  getRange(r, c, nr = 1, nc = 1) {
    const hoja = this;
    const celdas = fn => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) fn(r - 1 + i, c - 1 + j); };
    const poner = (i, j, v) => { while (hoja.filas.length <= i) hoja.filas.push([]); hoja.filas[i][j] = v; };
    return {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => {
        const v = hoja.filas[r - 1 + i]?.[c - 1 + j];
        return v === undefined ? '' : v;
      })),
      setValue: v => { celdas((i, j) => poner(i, j, convertir(v))); },
      setNumberFormat: () => {},
      clearContent: () => celdas((i, j) => poner(i, j, '')),
      setFontWeight: () => {},
    };
  }
}

export function crearGas({ hojas, props = {} }) {
  const ss = {
    hojas: Object.entries(hojas).map(([n, f]) => new Hoja(n, f)),
    getSheetByName(n) { return this.hojas.find(h => h.nombre === n) || null; },
    insertSheet(n) { const h = new Hoja(n, []); this.hojas.push(h); return h; },
    getSpreadsheetTimeZone: () => 'America/Montevideo',
  };
  let uuid = 0;
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => JSON.parse(s) }) },
    Utilities: { formatDate: () => '23-10-2026 14.30', getUuid: () => 'uuid-' + (++uuid) },
    Logger: { log() {} },
  };
  vm.createContext(ctx);
  const dir = new URL('../apps-script/', import.meta.url);
  vm.runInContext(fs.readFileSync(new URL('logica.js', dir), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(new URL('Code.gs', dir), 'utf8'), ctx);
  const post = p => ctx.doPost({ postData: { contents: JSON.stringify(p) } });
  return { ss, ctx, props, post, hoja: n => ss.getSheetByName(n) };
}
