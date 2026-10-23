// Logo Prolimpio redibujado en SVG a partir del logo oficial: dos círculos y "PRO limpio".
export function logoSVG({ animado = false } = {}) {
  return `<svg class="logo${animado ? ' animado' : ''}" viewBox="0 0 200 200" role="img" aria-label="Prolimpio">
    <circle class="c-amarillo" cx="100" cy="100" r="98" fill="#fbb03b"/>
    <circle class="c-naranja" cx="80" cy="120" r="70" fill="#f26b3a"/>
    <g class="l-texto" fill="#fff" font-family="'DM Sans', system-ui, sans-serif" font-weight="800">
      <text x="24" y="98" font-size="58" letter-spacing="-1">PRO</text>
      <text x="24" y="150" font-size="50" letter-spacing="-1.5">limpio</text>
    </g>
  </svg>`;
}
