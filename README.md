# Control de Stock Sucursales · Prolimpio

App para el celular que cuenta el stock de **Solymar** y **Minas** escaneando códigos de barra.
Cada carga se escribe directo en la planilla de Drive *BALANCE SOLYMAR ALTERNATIVOS*, a través de
un Apps Script vinculado a esa planilla.

- Diseño: `docs/superpowers/specs/2026-10-23-control-stock-sucursales-design.md`
- Plan: `docs/superpowers/plans/2026-10-23-control-stock-sucursales.md`

## Correr en la PC

```
cd "C:\SubatirApps\Control Stock Sucursales"
python -m http.server 8790
```

Abrir `http://localhost:8790`. Hay que servirla por HTTP: la cámara solo funciona en un origen
seguro (`localhost` o HTTPS).

Pruebas: `npm test` (Node 18 o más nuevo, sin dependencias). Incluye una planilla falsa en memoria
(`tests/gas-falso.mjs`) que ejecuta `Code.gs` de verdad.

## Poner en marcha el Apps Script

La planilla real es de **ximena@prolimpio.com.uy**. Un editor puede pegar el código y ejecutar
`instalar()`, pero **publicar la aplicación web (paso 5) lo tiene que hacer la dueña**: Google no deja
que un editor de otra organización la publique. Los pasos, una sola vez:

1. Abrir la planilla → **Extensiones → Apps Script**.
2. Crear dos archivos y pegar el contenido:
   - `Code.gs` ← `apps-script/Code.gs`
   - `Logica.gs` ← `apps-script/logica.js`
3. **Configuración del proyecto → Propiedades del script → Agregar**: `PIN_ENCARGADO` = el PIN.
4. Elegir la función `instalar` y tocar **Ejecutar**. Pide autorización la primera vez. Crea MINAS
   (copia de la pestaña de Solymar) e HISTORIAL. Se puede volver a correr sin riesgo. La pestaña de
   Solymar puede llamarse "Hoja 1" o "SOLYMAR": no se renombra, para no romper otras planillas que la lean.
5. **Implementar → Nueva implementación → Aplicación web**. *Ejecutar como*: yo. *Quién tiene
   acceso*: cualquier persona. Copiar la URL que termina en `/exec`.
6. Pegar esa URL en `js/config.js` (`API_URL`) y publicar.

Cuando se cambia `Code.gs` o `Logica.gs`: **Implementar → Gestionar implementaciones → editar
(lápiz) → Versión: nueva versión**. Así la URL no cambia. Esto también lo hace la dueña.

Para probar cambios sin tocar la real está la copia "BALANCE SOLYMAR ALTERNATIVOS — PRUEBA APP",
con su propio script y su propia URL `/exec`.

## Publicar

Doble clic en `publicar.bat`. Sube la versión (`version.ps1`), hace commit y push. Los celulares
toman la versión nueva solos, en el próximo momento en que no haya una ficha o la cámara abiertas.

## Cómo funciona

| Pieza | Qué hace |
|---|---|
| `apps-script/Code.gs` | Recibe las cargas, suma con bloqueo para que dos personas no se pisen, registra en HISTORIAL |
| `apps-script/logica.js` | Agrupa artículos repetidos, calcula sumas, correcciones y deshacer (sin APIs de Google) |
| `js/cola.js` | Guarda las cargas sin señal y las reintenta solas (2 s → 60 s) |
| `js/catalogo.js` | Encuentra un artículo por Cod. Art o cualquier Alternativo, con o sin ceros adelante |
| `js/escaner.js` | Cámara: lector nativo de Chrome o ZXing en iPhone |

Un Cod. Art que aparece en varias filas (una por código alternativo) es **un solo artículo**: la app
escribe solo en su primera fila y deja en blanco las otras, para que el total no se cuente dos veces.
