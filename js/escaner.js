// Lector de códigos de barra con la cámara trasera.
// BarcodeDetector nativo (Chrome Android); ZXing como respaldo (Safari iPhone).
const FORMATOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];
const ZXING = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm';
const REPETIDO_MS = 2000;

async function detectorNativo() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const soportados = await BarcodeDetector.getSupportedFormats();
    if (!soportados.includes('ean_13')) return null;
    return new BarcodeDetector({ formats: FORMATOS.filter(f => soportados.includes(f)) });
  } catch { return null; }
}

export async function iniciarEscaner(video, alLeer) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch {
    throw new Error('SIN_CAMARA');
  }
  video.srcObject = stream;
  await video.play().catch(() => {});

  let activo = true;
  let ultimo = '';
  let ultimoT = 0;
  const leido = codigo => {
    const t = Date.now();
    if (!activo || (codigo === ultimo && t - ultimoT < REPETIDO_MS)) return;
    ultimo = codigo; ultimoT = t;
    alLeer(String(codigo).trim());
  };

  let pararLector = () => {};
  const nativo = await detectorNativo();
  if (nativo) {
    const ciclo = async () => {
      if (!activo) return;
      try {
        if (video.readyState >= 2) {
          const r = await nativo.detect(video);
          if (r.length) leido(r[0].rawValue);
        }
      } catch { /* cuadro ilegible: seguir */ }
      if (activo) setTimeout(ciclo, 90);
    };
    ciclo();
  } else {
    try {
      const { BrowserMultiFormatReader } = await import(ZXING);
      const lector = new BrowserMultiFormatReader();
      const controles = await lector.decodeFromVideoElement(video, res => { if (res) leido(res.getText()); });
      pararLector = () => controles.stop();
    } catch {
      stream.getTracks().forEach(t => t.stop());
      throw new Error('SIN_LECTOR');
    }
  }

  const pista = stream.getVideoTracks()[0];
  return {
    tieneLinterna: !!pista?.getCapabilities?.().torch,
    async linterna(on) {
      try { await pista.applyConstraints({ advanced: [{ torch: on }] }); return true; } catch { return false; }
    },
    detener() {
      activo = false;
      pararLector();
      stream.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    },
  };
}
