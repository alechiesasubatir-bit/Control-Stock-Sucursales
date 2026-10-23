// Confeti suave con los colores del logo, una vez por sesión y sector al llegar al 100%.
import { on, estado, aviso, NOMBRES } from '../estado.js';

const COLORES = ['#fbb03b', '#f26b3a', '#ffd38a', '#1bc8ff', '#ffffff'];

export function initConfeti() {
  const canvas = document.getElementById('confeti');
  const hechos = new Set();
  on('completo', () => {
    const clave = estado.sucursal + estado.sector;
    if (hechos.has(clave)) return;
    hechos.add(clave);
    aviso(`¡${NOMBRES[estado.sector]} contado al 100%!`, 'ok');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    const dpr = devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const piezas = Array.from({ length: 110 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 80, y: innerHeight * 0.4,
      vx: (Math.random() - 0.5) * 11, vy: -Math.random() * 13 - 4,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, c: COLORES[(Math.random() * COLORES.length) | 0],
    }));
    const t0 = performance.now();
    const cuadro = t => {
      const p = (t - t0) / 1200;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const q of piezas) {
        q.vy += 0.38; q.vx *= 0.985; q.x += q.vx; q.y += q.vy; q.r += q.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - p * p);
        ctx.translate(q.x, q.y);
        ctx.rotate(q.r);
        ctx.fillStyle = q.c;
        ctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h);
        ctx.restore();
      }
      if (p < 1) requestAnimationFrame(cuadro);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    requestAnimationFrame(cuadro);
  });
}
