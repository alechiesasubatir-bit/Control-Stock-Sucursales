# Control de Stock Sucursales — Diseño

Fecha: 2026-10-23 · Subatir S.A. / Prolimpio

## Objetivo

App para el celular con la que el personal de las sucursales **Solymar** y **Minas** cuenta el stock
escaneando códigos de barra. Cada carga se escribe **directo en la planilla de Google Drive**
"BALANCE SOLYMAR ALTERNATIVOS"
(`18o8YsHKt0U3ZoYdeVd-D2DjcrBfzhicY9lw3RGjFXZU`), que sigue siendo la fuente de verdad: lo que se
carga en la app aparece en la planilla y lo que se edita en la planilla aparece en la app.

Éxito = una persona recorre el depósito o el salón con el celular, escanea, escribe la cantidad, y
al terminar la planilla tiene Depósito + Salón por artículo, el total y la línea `código,total`
lista para subir al sistema, sin haber tocado la planilla.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Minas | Pestaña **MINAS** en la misma planilla, mismas columnas |
| Pestaña actual | "Hoja 1" se renombra a **SOLYMAR** |
| Carga | Se escribe la cantidad y **se suma** a lo que ya hay en el sector; "Corregir" reemplaza |
| Identidad | Nombre (sin contraseña) + sucursal, recordados en el celular |
| Historial | Pestaña **HISTORIAL**, una fila por carga; permite deshacer |
| Nuevo conteo | Botón con PIN de encargado: archiva copia fechada y pone en blanco E, F, I |
| Arquitectura | App estática (GitHub Pages, instalable) + Google Apps Script como API |

## Arquitectura

```
Celular (PWA en GitHub Pages)  ──fetch POST text/plain──▶  Apps Script web app  ──▶  Planilla
   catálogo en caché local                                   LockService               SOLYMAR
   cola de cargas pendientes                                 idempotencia por id       MINAS
                                                                                       HISTORIAL
                                                                                       archivos
```

- Se descartó servir la página desde Apps Script (iframe de Google: la cámara falla en varios
  celulares y no se puede instalar) y la Sheets API con login de Google (cada empleado necesitaría
  una cuenta con acceso).
- El Apps Script va **vinculado a la planilla** (Extensiones → Apps Script) y se publica como
  aplicación web: *Ejecutar como: yo* · *Acceso: cualquier persona*.
- Los pedidos van por `POST` con `Content-Type: text/plain` para evitar el preflight de CORS; el
  cuerpo es JSON `{accion, ...}` y la respuesta es JSON `{ok, ...}` o `{ok:false, error}`.

### Seguridad

La URL del script es el único "secreto" para cargar y corregir; queda dentro del código de la app,
que es público en GitHub Pages. Se acepta para uso interno (el daño posible es un número mal
cargado, que el historial permite rastrear y deshacer). La única acción destructiva, **Nuevo
conteo**, exige el PIN de encargado, que vive en *Propiedades del script* (`PIN_ENCARGADO`), nunca
en la app.

## Planilla

### Pestañas de sucursal (SOLYMAR, MINAS)

Fila 1 = encabezados, datos desde la fila 2. Columnas:

| Col | Encabezado | Quién escribe |
|---|---|---|
| A | Cod. Art | planilla (la app solo lee) |
| B | Alternativo | planilla |
| C | Descripcion | planilla |
| D | Precio | planilla |
| E | DEPOSITO | **app** |
| F | LOCAL SOLYMAR / LOCAL MINAS | **app** |
| G | TOTAL DE STOCK | fórmula de la planilla |
| H | PARA SUBIR STOCK | fórmula de la planilla |
| I | Comentarios | **app** |

El script ubica las columnas **por encabezado** (DEPOSITO, LOCAL…, Comentarios, Cod. Art,
Alternativo), no por letra, para no romperse si alguien inserta una columna.

MINAS se crea duplicando SOLYMAR (mismas fórmulas en G y H), cambiando el encabezado de F a
"LOCAL MINAS" y dejando E, F, I en blanco. Lo hace una función de instalación del script
(`instalar()`), que también renombra "Hoja 1" a SOLYMAR y crea HISTORIAL si no existen. Es
idempotente: si ya existen, no las toca.

### Artículos repetidos

Un mismo Cod. Art aparece en varias filas, una por código alternativo (ej. 330056 × 3). La app los
agrupa como **un artículo** con todos sus códigos. Las cantidades y el comentario se escriben **solo
en la primera fila** de ese Cod. Art; las demás quedan en blanco para que G y H no lo cuenten dos
veces. Al leer, si alguien cargó a mano en una fila repetida, la app suma todas las filas del
artículo para mostrar el número real.

Filas sin Cod. Art: se identifican por su Alternativo. Filas sin ninguno de los dos se ignoran.

### HISTORIAL

| id | fecha_hora | sucursal | sector | cod_art | descripcion | accion | cantidad | antes | despues | usuario | conteo | estado |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

- `id`: UUID generado en el celular. Si llega dos veces (reintento de la cola), el script responde
  con el resultado original y no vuelve a sumar.
- `accion`: `sumar` · `corregir` · `comentar` · `deshacer` · `nuevo_conteo`.
- `conteo`: identificador del conteo vigente de esa sucursal (fecha del último Nuevo conteo).
- `estado`: vacío, o `deshecho` cuando se revirtió.

## Apps Script — acciones

Todas las escrituras toman `LockService.getScriptLock()` (espera hasta 10 s), leen el valor actual
de la celda, escriben y registran en HISTORIAL dentro del mismo bloqueo.

| Acción | Entrada | Efecto |
|---|---|---|
| `catalogo` | `sucursal` | Devuelve artículos agrupados `{cod, codigos[], desc, precio, deposito, salon, comentario}`, el `conteo` vigente y la hora del servidor |
| `sumar` | `id, sucursal, sector, cod, cantidad, usuario` | celda += cantidad (entero > 0) |
| `corregir` | `id, sucursal, sector, cod, valor, usuario` | celda = valor (entero ≥ 0) |
| `comentar` | `id, sucursal, cod, texto, usuario` | I = texto (vacío borra) |
| `deshacer` | `id, idOriginal, usuario` | Revierte: `sumar` resta la cantidad (sin bajar de 0); `corregir` y `comentar` vuelven a `antes` solo si la celda todavía vale `despues`, si no responde conflicto. Solo cargas del conteo vigente y no deshechas |
| `historial` | `sucursal, usuario?, desde?` | Últimas cargas, para "Mis cargas" |
| `nuevoConteo` | `sucursal, pin, usuario` | Valida PIN; copia la pestaña como `SOLYMAR 23-10-2026 14.30`; pone en blanco E, F, I; registra `nuevo_conteo` |

`sector` es `deposito` o `salon`. Cada respuesta de escritura devuelve los valores nuevos del
artículo para que la app actualice la pantalla sin recargar el catálogo.

Errores: el script nunca tira una excepción hacia afuera; responde `{ok:false, error, codigo}` con
códigos `PIN_INCORRECTO`, `ARTICULO_NO_ENCONTRADO`, `CONFLICTO`, `OCUPADO` (no consiguió el
bloqueo), `DATOS_INVALIDOS`.

## App

HTML/CSS/JS sin paso de compilación (módulos ES), como las demás apps de Subatir. Instalable
(manifest + service worker que cachea la app, nunca los datos).

### Archivos

```
index.html            estructura y pantallas
css/app.css           tokens, componentes, animaciones
js/main.js            arranque, navegación entre pantallas
js/api.js             fetch al Apps Script, timeouts, mapeo de errores
js/catalogo.js        índice código→artículo, búsqueda, filtros (lógica pura)
js/cola.js            cola de cargas pendientes en localStorage y reintento (lógica pura + timer)
js/escaner.js         cámara: BarcodeDetector nativo o ZXing de respaldo
js/ui/*.js            una por pantalla: ingreso, escanear, ficha, cargas, articulos, encargado
js/logo.js            logo Prolimpio en SVG animado
apps-script/Code.gs   backend
tests/*.test.mjs      node --test para catalogo, cola y la lógica pura del script
```

### Datos en el celular

- `localStorage`: nombre, sucursal, sector activo, catálogo en caché (para abrir al instante) y la
  cola de pendientes.
- Al abrir y cada 60 s con la app visible, se pide el catálogo de nuevo para ver lo que cargaron
  los demás o lo editado en la planilla.

### Sin señal

Cada carga se agrega a la cola con su UUID y se aplica de forma optimista en pantalla. La cola se
manda en orden, una por vez; si falla por red se reintenta con espera creciente (2 s → 60 s), al
recuperar conexión y al volver a la app. Si el script responde un error de datos, la carga sale de
la cola, se marca en rojo en "Mis cargas" y se revierte en pantalla. No existe botón de
sincronizar; en el encabezado hay un indicador: ☁ al día · ⟳ n pendientes · ⚠ sin conexión.

### Pantallas

1. **Ingreso** (primera vez): logo animado, tarjetas Solymar / Minas, campo nombre. Cambiable
   desde el menú.
2. **Escanear** (principal): selector Depósito | Salón siempre visible arriba; botón de cámara
   grande; buscador por nombre o código; anillo de avance "312 de 1.890 contados" del sector.
3. **Visor**: cámara a pantalla completa, línea láser, linterna si el equipo la ofrece. Al leer:
   vibración + bip + abre la ficha. Código desconocido: aviso con el código leído y paso directo
   al buscador.
4. **Ficha** (hoja inferior): descripción, Cod. Art, precio, códigos; Depósito / Salón / Total con
   el sector activo resaltado; teclado numérico grande con −/+; botón principal "Sumar N a
   Depósito"; "Corregir"; "Comentario". Al confirmar: número que cuenta hasta el valor nuevo, ✓, y
   vuelve a abrir la cámara.
5. **Mis cargas**: cargas propias del conteo vigente, con estado (guardada / pendiente / error) y
   deshacer.
6. **Artículos**: lista con búsqueda y filtros Todos | Contados | Sin contar | Con comentario;
   tocar abre la ficha.
7. **Encargado** (PIN): resumen del conteo y Nuevo conteo con confirmación en dos pasos.

"Contado" = el artículo tiene un valor cargado (aunque sea 0) en el sector; vacío = sin contar.

### Escaneo

`BarcodeDetector` nativo cuando existe (Chrome Android); si no, `@zxing/browser` desde jsDelivr
(Safari iPhone). Formatos: EAN-13, EAN-8, UPC-A, UPC-E, Code128, Code39, ITF. El mismo código leído
dos veces en menos de 2 s se ignora. Al buscar, se comparan códigos sin ceros a la izquierda y sin
espacios, contra Cod. Art y Alternativo.

### Visual

- Estilo Subatir: fondo `#07090f` con brillos difusos teal arriba y naranja/amarillo de Prolimpio
  abajo, tarjetas glass, Syne (títulos) / DM Sans (texto) / IBM Plex Mono (números).
- Acento principal: naranja Prolimpio `#f26b3a` y amarillo `#fbb03b`, tomados del logo.
- Logo redibujado en SVG a partir de `SistemaComprasSubatir/logo-prolimpio.jpg` (dos círculos +
  "PRO limpio"); al entrar los círculos giran hasta encajar.
- Movimiento: transición entre pantallas, ficha con resorte, números que cuentan, láser del visor,
  confeti suave al llegar a 100% en un sector. Todo se apaga con `prefers-reduced-motion`.
- Pensado para una mano: acciones en la mitad inferior, objetivos táctiles de 48 px o más, solo
  vertical.

## Pruebas

- `node --test`: índice de códigos (repetidos, sin Cod. Art, ceros a la izquierda), búsqueda,
  filtros, cola (orden, reintento, idempotencia, error de datos) y la lógica pura del script
  (agrupar filas, aplicar sumar/corregir/deshacer sobre una matriz) separada en funciones que no
  usan `SpreadsheetApp`.
- Prueba real contra la planilla desde el navegador: sumar, corregir, comentar, deshacer y dos
  cargas simultáneas al mismo artículo, verificando celdas y HISTORIAL. Antes se hace una copia de
  la planilla; Nuevo conteo se prueba solo sobre la copia.
- Prueba en celular real Android e iPhone para la cámara.

## Puesta en marcha

1. Copiar `Code.gs` en Extensiones → Apps Script de la planilla, cargar `PIN_ENCARGADO` en
   Propiedades del script, ejecutar `instalar()` una vez (pide autorización) y publicar como
   aplicación web. Lo hace el dueño de la planilla; la app recibe la URL `/exec`.
2. Publicar la app en un repositorio nuevo de GitHub Pages con un `publicar.bat` como el de
   Compras (ASCII + CRLF).

## Fuera de alcance

- Más sucursales que Solymar y Minas (la estructura lo permite: agregar una pestaña y una tarjeta).
- Editar artículos, precios o códigos desde la app.
- Subir el stock al sistema de gestión (se sigue usando la columna H).
- Usuarios con contraseña o permisos más allá del PIN de encargado.
