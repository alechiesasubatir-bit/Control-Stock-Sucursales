// Cliente del Apps Script. text/plain evita el preflight de CORS que Apps Script no responde.
import { API_URL } from './config.js';

export class ErrorRed extends Error {
  constructor(mensaje) { super(mensaje); this.name = 'ErrorRed'; }
}

let urlActual = API_URL;
export function fijarUrl(url) { urlActual = url; }

export async function llamar(cuerpo, { timeout = 15000, url = urlActual } = {}) {
  if (!url) throw new ErrorRed('sin conexión configurada');
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), timeout);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(cuerpo),
      signal: control.signal,
      redirect: 'follow',
    });
    const texto = await r.text();
    try { return JSON.parse(texto); } catch { throw new ErrorRed('respuesta inválida del servidor'); }
  } catch (e) {
    throw e instanceof ErrorRed ? e : new ErrorRed(e?.message || 'sin conexión');
  } finally {
    clearTimeout(reloj);
  }
}
