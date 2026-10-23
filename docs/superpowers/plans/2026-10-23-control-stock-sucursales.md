# Control de Stock Sucursales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PWA de conteo por escaneo para Solymar y Minas que escribe directo en la planilla de Drive a través de un Apps Script.

**Architecture:** App estática sin compilación (módulos ES) publicada en GitHub Pages. Habla por `POST text/plain` con un Apps Script vinculado a la planilla, que resuelve cada escritura bajo `LockService` y la registra en HISTORIAL. La lógica que no depende de Google (agrupar filas, aplicar cargas, deshacer, idempotencia) vive en `apps-script/logica.js` y se prueba en Node; el resto del script es cableado fino.

**Tech Stack:** HTML/CSS/JS vanilla (ES modules), `node --test` (Node ≥ 18, sin dependencias), Google Apps Script V8, `@zxing/browser` por jsDelivr como respaldo de `BarcodeDetector`, Google Fonts (Syne, DM Sans, IBM Plex Mono).

**Spec:** `docs/superpowers/specs/2026-10-23-control-stock-sucursales-design.md`

## Global Constraints

- Planilla: `18o8YsHKt0U3ZoYdeVd-D2DjcrBfzhicY9lw3RGjFXZU`. Pestañas `SOLYMAR`, `MINAS`, `HISTORIAL`. Encabezados en fila 1, datos desde fila 2.
- Columnas se ubican **por encabezado**: `Cod. Art`, `Alternativo`, `Descripcion`, `Precio`, `DEPOSITO`, el que empieza con `LOCAL`, `Comentarios`. Nunca por letra.
- La app escribe solo DEPOSITO, LOCAL… y Comentarios, y solo en la **primera fila** de cada Cod. Art.
- Sucursales (valor de API): `solymar` | `minas`. Sectores: `deposito` | `salon`.
- Cantidades: enteros. `sumar` > 0; `corregir` ≥ 0. Nada baja de 0.
- Celda vacía = sin contar; `0` = contado en cero. La distinción se conserva en todo el código (`null` vs `0`).
- Códigos de error: `PIN_INCORRECTO`, `ARTICULO_NO_ENCONTRADO`, `CONFLICTO`, `OCUPADO`, `DATOS_INVALIDOS`.
- HISTORIAL, columnas en este orden: `id, fecha_hora, sucursal, sector, cod_art, descripcion, accion, cantidad, antes, despues, usuario, conteo, estado`.
- Nombre de archivo de conteo: `SOLYMAR 23-10-2026 14.30` (pestaña en mayúsculas + `dd-MM-yyyy HH.mm`, zona del script).
- PIN en Propiedades del script, clave `PIN_ENCARGADO`. Nunca en la app.
- Estética: tokens del spec (`#07090f`, naranja `#f26b3a`, amarillo `#fbb03b`, teal `#0e8aaa`/`#1bc8ff`), objetivos táctiles ≥ 48 px, todo movimiento detrás de `prefers-reduced-motion`.
- Claves de `localStorage` con prefijo `css.` (`css.usuario`, `css.sucursal`, `css.sector`, `css.catalogo.<sucursal>`, `css.cola`, `css.cargas`). Toda lectura/escritura en try/catch.
- Archivos `.bat` en ASCII y CRLF.

## Review Focus

1. **Código leído con o sin ceros a la izquierda** (UPC-A de 12 dígitos guardado `915120013255` leído como EAN-13 `0915120013255`): debe encontrar el artículo. → test en Task 1.
2. **Reintento de una carga que el servidor ya aplicó** (timeout de red después de escribir): no debe sumar dos veces. → test de `buscarPorId` en Task 2 y de la cola en Task 4.
3. **Celdas tocadas a mano en la planilla** (`"12 "`, `"12,0"`, texto, valor en una fila repetida del mismo Cod. Art): la app muestra el número real y no confunde vacío con 0. → tests de `parsearCantidad` y `agruparFilas` en Task 2.
4. **Planilla ordenada o con filas insertadas entre que la app cargó el catálogo y escribe**: el script ubica la fila por Cod. Art en el momento de escribir, nunca por número de fila recibido de la app. → test de `filaDeArticulo` en Task 2.
5. **Deshacer un `sumar` cuando el número ya bajó** (otra persona corrigió): resta sin bajar de 0; deshacer un `corregir` con la celda cambiada responde `CONFLICTO`. → tests de `calcularDeshacer` en Task 2.

---

## File Structure

```
package.json                 {"type":"module","scripts":{"test":"node --test tests/"}}
index.html                   shell + plantillas de las 7 pantallas
manifest.json, sw.js         PWA (sw cachea solo archivos de la app)
icons/                       icon-192.png, icon-512.png, icon-maskable-512.png
css/app.css                  tokens, layout, componentes, animaciones
js/config.js                 export const API_URL = '...'; export const VERSION = '...'
js/catalogo.js               lógica pura: índice, búsqueda, filtros, avance
js/cola.js                   lógica de cola con dependencias inyectadas
js/api.js                    fetch al script → {ok,...} | throw ErrorRed
js/estado.js                 estado de la app + persistencia localStorage + eventos
js/escaner.js                cámara: BarcodeDetector | ZXing
js/logo.js                   SVG Prolimpio animado
js/ui/*.js                   ingreso, escanear, visor, ficha, cargas, articulos, encargado
js/main.js                   arranque y navegación
apps-script/logica.js        lógica pura del backend (también se pega como Logica.gs)
apps-script/Code.gs          doPost, acciones, instalar()
tests/catalogo.test.mjs, tests/cola.test.mjs, tests/logica.test.mjs
publicar.bat, README.md, .gitattributes
```

---

### Task 1: Catálogo — índice y búsqueda (lógica pura)

**Files:**
- Create: `package.json`, `.gitattributes` (`*.bat text eol=crlf`), `js/catalogo.js`
- Test: `tests/catalogo.test.mjs`

**Interfaces:**
- Produces:
  - Tipo `Articulo = {cod:string, codigos:string[], desc:string, precio:number|null, deposito:number|null, salon:number|null, comentario:string}` (lo devuelve el script, Task 2).
  - `normalizarCodigo(s:string): string`: quita espacios y ceros a la izquierda; `''` si no queda nada.
  - `crearIndice(articulos:Articulo[]): Map<string, Articulo>`: clave = código normalizado de `cod` y de cada `codigos[i]`.
  - `buscarPorCodigo(indice, leido:string): Articulo|null`
  - `buscarTexto(articulos, texto:string, limite=50): Articulo[]`: sin acentos ni mayúsculas, todas las palabras deben aparecer en `desc`, o coincidencia por prefijo de código.
  - `filtrar(articulos, filtro:'todos'|'contados'|'sinContar'|'comentados', sector:'deposito'|'salon'): Articulo[]`
  - `avance(articulos, sector): {contados:number, total:number}`
  - `total(a:Articulo): number|null`: `null` si ambos sectores son `null`.

- [ ] **Step 1: Write the failing tests**

```js
import { test } from 'node:test'; import assert from 'node:assert/strict';
import * as C from '../js/catalogo.js';
const A = [
  { cod:'330056', codigos:['4056807558707','7891799092450'], desc:'Antiempañante 60 ml. WURTH', precio:432, deposito:3, salon:null, comentario:'' },
  { cod:'330004', codigos:['915120013255'], desc:'Acido Citrico x 1 Kg', precio:277, deposito:null, salon:null, comentario:'vence pronto' },
  { cod:'210210', codigos:[], desc:'Agua Lavandina x 10 lts.', precio:359, deposito:0, salon:2, comentario:'' },
];
test('normaliza ceros y espacios', () => { assert.equal(C.normalizarCodigo(' 0915120013255 '), '915120013255'); assert.equal(C.normalizarCodigo('000'), ''); });
test('UPC-A leido como EAN-13 encuentra el articulo', () => assert.equal(C.buscarPorCodigo(C.crearIndice(A), '0915120013255').cod, '330004'));
test('cualquier alternativo y el cod art encuentran el mismo articulo', () => { const i = C.crearIndice(A); assert.equal(C.buscarPorCodigo(i,'7891799092450').cod,'330056'); assert.equal(C.buscarPorCodigo(i,'330056').cod,'330056'); });
test('codigo desconocido devuelve null', () => assert.equal(C.buscarPorCodigo(C.crearIndice(A),'123'), null));
test('busqueda sin acentos y por palabras', () => assert.deepEqual(C.buscarTexto(A,'antiempanante wurth').map(a=>a.cod), ['330056']));
test('busqueda por prefijo de codigo', () => assert.deepEqual(C.buscarTexto(A,'2102').map(a=>a.cod), ['210210']));
test('cero cuenta como contado, null no', () => { assert.deepEqual(C.filtrar(A,'contados','deposito').map(a=>a.cod), ['330056','210210']); assert.deepEqual(C.avance(A,'salon'), {contados:1,total:3}); });
test('filtro comentados', () => assert.deepEqual(C.filtrar(A,'comentados','deposito').map(a=>a.cod), ['330004']));
test('total', () => { assert.equal(C.total(A[0]),3); assert.equal(C.total(A[1]),null); assert.equal(C.total(A[2]),2); });
```

- [ ] **Step 2: Run** `npm test` → FAIL (módulo no existe).
- [ ] **Step 3: Implement** `js/catalogo.js` con las firmas de arriba. Quitar acentos con `normalize('NFD').replace(/\p{Diacritic}/gu,'')`.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: indice y busqueda del catalogo"`

---

### Task 2: Lógica pura del backend

**Files:**
- Create: `apps-script/logica.js`
- Test: `tests/logica.test.mjs` (cargar con `createRequire(import.meta.url)('../apps-script/logica.js')`)

El archivo es script clásico (sin `import/export`), porque se pega tal cual en Apps Script como `Logica.gs`. Al final:
`if (typeof module !== 'undefined') module.exports = { ubicarColumnas, parsearCantidad, agruparFilas, filaDeArticulo, aplicar, calcularDeshacer, buscarPorId, nombreArchivo, validar };`

**Interfaces:**
- Produces:
  - `ubicarColumnas(encabezados:any[]): {cod,alt,desc,precio,deposito,salon,coment}`: índices base 0; comparación sin mayúsculas ni espacios ni puntos (`'Cod. Art'`→`codart`); `salon` = primera que empieza con `local`. Lanza `Error('DATOS_INVALIDOS: falta columna X')` si falta alguna.
  - `parsearCantidad(v): number|null`: `''`/`null` → `null`; número → `Math.round`; texto `"12 "`, `"12,0"` → 12; texto no numérico → `null`.
  - `agruparFilas(valores:any[][], cols): Articulo[]` (`valores` sin la fila de encabezados): agrupa por Cod. Art (o por Alternativo si no hay Cod. Art; omite si no hay ninguno); `codigos` = alternativos únicos no vacíos; `deposito`/`salon` = suma de las filas del grupo, `null` si todas vacías; `comentario` = comentarios no vacíos unidos con `' · '`; desc/precio de la primera fila; agrega `fila` (número de fila de la planilla, base 1, de la primera fila del grupo, = índice + 2). Mantiene el orden de la planilla.
  - `filaDeArticulo(valores, cols, cod:string): number|null`: fila de planilla (base 1) de la primera fila cuyo Cod. Art (o Alternativo si el artículo no tiene Cod. Art) normalizado coincide.
  - `aplicar(accion:'sumar'|'corregir', actual:number|null, n:number): number`: sumar → `(actual??0)+n`; corregir → `n`.
  - `calcularDeshacer(reg:{accion,cantidad,antes,despues,estado}, actual): {valor}|{error:'CONFLICTO'|'DATOS_INVALIDOS'}`: sumar → `max(0,(actual??0)-cantidad)`; corregir/comentar → `antes` si `actual` igual a `despues` (comparando como texto, `null`↔`''`), si no `CONFLICTO`; `estado==='deshecho'` o acción `deshacer`/`nuevo_conteo` → `DATOS_INVALIDOS`.
  - `buscarPorId(historial:any[][], id:string): number|null`: índice de la fila de HISTORIAL (sin encabezado) con ese id en la columna 0.
  - `nombreArchivo(pestana:string, fecha:Date, tz:string, formatear:(d,tz,patron)=>string): string` → `` `${pestana.toUpperCase()} ${formatear(fecha,tz,'dd-MM-yyyy HH.mm')}` ``.
  - `validar(p:object): string|null`: mensaje si falta algo o la cantidad no es entera (`sumar` > 0, `corregir` ≥ 0), sucursal fuera de `solymar|minas`, sector fuera de `deposito|salon`, `id` vacío.

- [ ] **Step 1: Write the failing tests**

```js
const ENC = ['Cod. Art','Alternativo','Descripcion',' Precio','DEPOSITO','LOCAL SOLYMAR','TOTAL DE STOCK','PARA SUBIR STOCK','Comentarios'];
test('ubica columnas por encabezado aunque se inserte una', () => {
  const c = L.ubicarColumnas(['X', ...ENC]); assert.equal(c.deposito, 5); assert.equal(c.salon, 6); assert.equal(c.coment, 9);
});
test('falta columna -> error', () => assert.throws(() => L.ubicarColumnas(['Cod. Art']), /DATOS_INVALIDOS/));
test('parsearCantidad', () => { assert.equal(L.parsearCantidad(''), null); assert.equal(L.parsearCantidad(0), 0); assert.equal(L.parsearCantidad('12 '), 12); assert.equal(L.parsearCantidad('12,0'), 12); assert.equal(L.parsearCantidad('abc'), null); });
const V = [
  ['330056','4056807558707','Antiempañante',432,3,'','','',''],
  ['330056','7891799092450','Antiempañante',432,'',2,'','','ojo'],
  ['330056','7891799992453','Antiempañante',432,'','','','',''],
  ['','7790000000001','Sin cod art',10,'','','','',''],
  ['','','Fila vacia','','','','','',''],
  ['330004','915120013255','Acido Citrico',277,0,'','','',''],
];
test('agrupa repetidos y suma valores cargados a mano', () => {
  const a = L.agruparFilas(V, L.ubicarColumnas(ENC));
  assert.equal(a.length, 3);
  assert.deepEqual(a[0], { cod:'330056', codigos:['4056807558707','7891799092450','7891799992453'], desc:'Antiempañante', precio:432, deposito:3, salon:2, comentario:'ojo', fila:2 });
  assert.equal(a[1].cod, '7790000000001'); assert.equal(a[2].deposito, 0); assert.equal(a[2].salon, null);
});
test('fila por cod art en el momento de escribir', () => { const c = L.ubicarColumnas(ENC); assert.equal(L.filaDeArticulo(V,c,'330004'), 7); assert.equal(L.filaDeArticulo([V[5],...V],c,'330004'), 2); assert.equal(L.filaDeArticulo(V,c,'999'), null); });
test('aplicar', () => { assert.equal(L.aplicar('sumar', null, 5), 5); assert.equal(L.aplicar('sumar', 3, 5), 8); assert.equal(L.aplicar('corregir', 8, 0), 0); });
test('deshacer sumar no baja de cero', () => assert.deepEqual(L.calcularDeshacer({accion:'sumar',cantidad:5,antes:3,despues:8,estado:''}, 2), {valor:0}));
test('deshacer corregir con celda cambiada -> conflicto', () => assert.deepEqual(L.calcularDeshacer({accion:'corregir',cantidad:10,antes:4,despues:10,estado:''}, 11), {error:'CONFLICTO'}));
test('deshacer corregir vuelve a vacio', () => assert.deepEqual(L.calcularDeshacer({accion:'corregir',cantidad:10,antes:'',despues:10,estado:''}, 10), {valor:null}));
test('no se deshace dos veces', () => assert.deepEqual(L.calcularDeshacer({accion:'sumar',cantidad:1,antes:0,despues:1,estado:'deshecho'}, 1), {error:'DATOS_INVALIDOS'}));
test('idempotencia: encuentra id ya aplicado', () => assert.equal(L.buscarPorId([['a'],['b']], 'b'), 1));
test('nombre de archivo', () => assert.equal(L.nombreArchivo('Solymar', new Date(), 'X', () => '23-10-2026 14.30'), 'SOLYMAR 23-10-2026 14.30'));
test('validar rechaza decimales y negativos', () => {
  const base = { id:'x', sucursal:'solymar', sector:'deposito', cod:'1', usuario:'Ana' };
  assert.ok(L.validar({...base, accion:'sumar', cantidad:1.5})); assert.ok(L.validar({...base, accion:'sumar', cantidad:0}));
  assert.equal(L.validar({...base, accion:'corregir', valor:0}), null); assert.ok(L.validar({...base, sucursal:'otra', accion:'sumar', cantidad:1}));
});
```

- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement** `apps-script/logica.js` con las firmas de arriba (sin APIs de Google).
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: logica pura del backend"`

---

### Task 3: Apps Script — acciones y instalación

**Files:**
- Create: `apps-script/Code.gs`

**Interfaces:**
- Consumes: todo `logica.js` (Task 2), como globales del proyecto de Apps Script.
- Produces (contrato HTTP, cuerpo JSON en `POST`, respuesta JSON):
  - `{accion:'catalogo', sucursal}` → `{ok:true, articulos:Articulo[], conteo:string, ahora:string}`
  - `{accion:'sumar'|'corregir', id, sucursal, sector, cod, cantidad|valor, usuario}` → `{ok:true, articulo:Articulo, repetido?:true}`
  - `{accion:'comentar', id, sucursal, cod, texto, usuario}` → `{ok:true, articulo}`
  - `{accion:'deshacer', id, idOriginal, usuario}` → `{ok:true, articulo}`
  - `{accion:'historial', sucursal, usuario?}` → `{ok:true, cargas:[{id,fecha_hora,sector,cod_art,descripcion,accion,cantidad,antes,despues,usuario,estado}]}`: últimas 200 del conteo vigente, más nuevas primero.
  - `{accion:'nuevoConteo', sucursal, pin, usuario}` → `{ok:true, archivo:string}`
  - Error: `{ok:false, codigo, error}`.
  - `instalar()`: renombra `Hoja 1`→`SOLYMAR` si existe; crea `MINAS` (duplicado de SOLYMAR, encabezado de la columna salón = `LOCAL MINAS`, DEPOSITO/LOCAL/Comentarios en blanco desde fila 2) si no existe; crea `HISTORIAL` con encabezados si no existe. Idempotente.

Notas que fija el plan:
- `doPost(e)`: `JSON.parse(e.postData.contents)`, router, siempre `ContentService...setMimeType(JSON)`, `try/catch` que mapea `Error('CODIGO: msg')` a `{ok:false,codigo,error}`.
- Pestaña de sucursal: `solymar`→`SOLYMAR`, `minas`→`MINAS`.
- Escrituras: `LockService.getScriptLock().tryLock(10000)`, si no → `OCUPADO`. Dentro del lock: primero `buscarPorId` en HISTORIAL (si existe → devolver el artículo actual con `repetido:true` sin escribir), después leer la pestaña completa (`getDataRange().getValues()`), `filaDeArticulo`, escribir con `getRange(fila, col+1).setValue(...)` (`null` → `''`), `appendRow` en HISTORIAL, `SpreadsheetApp.flush()`.
- Al escribir en la primera fila de un artículo repetido, el valor nuevo se calcula sobre la **suma del grupo** (`agruparFilas`) y se ponen en blanco esa columna en las demás filas del grupo, para que queden consolidadas.
- `conteo` vigente: valor de `PropertiesService.getScriptProperties()` clave `CONTEO_<SUCURSAL>`; si no existe, `'inicial'`. `nuevoConteo` lo pone en la fecha del archivo.
- `nuevoConteo`: compara `pin` con `PIN_ENCARGADO` (si la propiedad no existe → `PIN_INCORRECTO`), `sheet.copyTo(ss).setName(nombreArchivo(...))`, limpia DEPOSITO, LOCAL, Comentarios desde fila 2 (`clearContent`), registra `nuevo_conteo` en HISTORIAL.
- `deshacer`: busca el registro original, exige que su `conteo` sea el vigente (si no → `DATOS_INVALIDOS`), `calcularDeshacer`, escribe, marca la fila original `estado='deshecho'` y agrega una fila `deshacer`.

- [ ] **Step 1: Implement** `apps-script/Code.gs` según el contrato.
- [ ] **Step 2: Syntax check** `node --check apps-script/Code.gs` no sirve por la extensión: `node -e "new Function(require('fs').readFileSync('apps-script/Code.gs','utf8'))"` → sin salida. `npm test` sigue en PASS.
- [ ] **Step 3: Commit** `git commit -m "feat: apps script con acciones e instalacion"`

La verificación real del script es la Task 10.

---

### Task 4: Cola de cargas y cliente de API

**Files:**
- Create: `js/config.js` (`API_URL = ''` hasta la Task 10, `VERSION`), `js/api.js`, `js/cola.js`
- Test: `tests/cola.test.mjs`

**Interfaces:**
- Produces:
  - `api.js`: `llamar(cuerpo:object, {timeout=15000}={}): Promise<object>`. Hace `fetch(API_URL,{method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(cuerpo)})`. Devuelve el JSON tal cual (incluido `ok:false`). Lanza `ErrorRed` (clase exportada) si hay fallo de red, timeout o la respuesta no es JSON.
  - `cola.js`: `crearCola({enviar, guardar, cargar, ahora=Date.now, esperar}): Cola` con
    - `agregar(op:{id,...}): void`: agrega y persiste.
    - `pendientes(): op[]`
    - `procesar(): Promise<void>`: manda en orden, una a la vez; `ok:true` → saca y emite `onResultado(op, resp)`; `ok:false` → saca y emite `onError(op, resp)`; `ErrorRed` → corta, deja la op primera y programa reintento con `esperar(ms)`: 2000, 4000, 8000 … tope 60000; un éxito reinicia el contador. Llamadas concurrentes a `procesar` no duplican envíos.
    - `onResultado(fn)`, `onError(fn)`, `onCambio(fn)` (cantidad de pendientes).

- [ ] **Step 1: Write the failing tests** (con `enviar` falso y `esperar` que solo registra el ms)

```js
test('envia en orden y vacia', async () => { /* agregar a,b; enviar ok → enviados ['a','b'], pendientes [] */ });
test('error de red conserva la op y reintenta con espera creciente', async () => { /* enviar lanza ErrorRed 3 veces → esperas [2000,4000,8000], pendientes ['a'] */ });
test('error de datos saca la op y avisa', async () => { /* enviar → {ok:false,codigo:'DATOS_INVALIDOS'} → onError llamado, pendientes [] */ });
test('reintento manda el mismo id', async () => { /* falla red una vez, después ok → los dos envíos con id 'a' */ });
test('procesar concurrente no duplica', async () => { /* Promise.all([procesar(),procesar()]) → enviar llamado 1 vez por op */ });
test('persiste y recupera', () => { /* guardar recibe la lista; crearCola con cargar() → pendientes restaurados */ });
```

- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement** `js/cola.js` y `js/api.js`.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: cola de cargas con reintento y cliente de api"`

---

### Task 5: Base visual, logo, estado y pantalla de Ingreso

**Files:**
- Create: `index.html`, `css/app.css`, `js/logo.js`, `js/estado.js`, `js/main.js`, `js/ui/ingreso.js`

**Interfaces:**
- Consumes: `catalogo.js` (Task 1), `api.llamar` y `crearCola` (Task 4).
- Produces:
  - `estado.js`: objeto `estado` con `{usuario, sucursal, sector, articulos, indice, conteo, cargas}`; `on(evento, fn)` / `emitir(evento, datos)` con eventos `'catalogo'`, `'articulo'` (un artículo cambió), `'cola'`, `'red'`; `guardarPreferencias()`; `cargarCatalogo(): Promise<void>` (lee caché `css.catalogo.<sucursal>` al instante, después pide al script y reemplaza); `actualizarArticulo(a:Articulo)`; `registrarCarga(op)` (inmediato y optimista: aplica el cambio al artículo en memoria, agrega a `css.cargas`, encola).
  - `main.js`: `ir(pantalla:string, datos?)` con transición; pantallas `ingreso, escanear, visor, ficha, cargas, articulos, encargado`. La ficha es una hoja inferior sobre la pantalla actual, no un reemplazo.
  - `logo.js`: `logoSVG({animado:boolean}): string`: círculo amarillo `#fbb03b`, círculo naranja `#f26b3a` desplazado abajo a la izquierda, texto "PRO" / "limpio" blanco en Syne 800. Animado: los círculos entran rotando desde lados opuestos y encajan (≈900 ms, `cubic-bezier(.2,.9,.2,1.2)`), el texto aparece después.

Notas que fija el plan:
- Fondo: `body{background:#07090f}` + `::before` con radiales teal arriba a la izquierda y naranja/amarillo abajo a la derecha, con deriva lenta (40 s) desactivada con reduced-motion.
- Encabezado fijo: logo chico, sucursal, indicador de red (☁ al día · ⟳ n · ⚠ sin conexión) y menú (cambiar sucursal/nombre, Encargado).
- Barra inferior: Escanear · Artículos · Mis cargas.
- Ingreso: logo animado grande, tarjetas Solymar / Minas, input nombre (mín. 2 caracteres), botón "Empezar". Si ya hay `css.usuario` y `css.sucursal`, se salta.
- Arranque: `cargarCatalogo()` + `cola.procesar()`; refresco cada 60 s si `document.visibilityState==='visible'`; `online` y `visibilitychange` → `procesar()`.

- [ ] **Step 1: Implement** los archivos.
- [ ] **Step 2: Verify** `python -m http.server 8790` y abrir `http://localhost:8790` en Chrome con viewport de 390×844: ingreso animado, elegir Solymar + nombre → pasa a Escanear (vacía todavía), se recuerda al recargar. Consola sin errores. Con "reducir movimiento" emulado, el logo aparece sin animación.
- [ ] **Step 3: Commit** `git commit -m "feat: base visual, logo animado e ingreso"`

---

### Task 6: Escanear y visor de cámara

**Files:**
- Create: `js/escaner.js`, `js/ui/escanear.js`, `js/ui/visor.js`

**Interfaces:**
- Consumes: `estado`, `buscarPorCodigo`, `buscarTexto`, `avance` (Task 1), `ir` (Task 5).
- Produces:
  - `escaner.js`: `iniciarEscaner(video:HTMLVideoElement, alLeer:(codigo:string)=>void): Promise<{detener():void, linterna(on:boolean):Promise<boolean>}>`. Usa `BarcodeDetector` si `'BarcodeDetector' in window` y soporta `ean_13`; si no, importa `https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm`. Formatos `ean_13, ean_8, upc_a, upc_e, code_128, code_39, itf`. Cámara trasera (`facingMode:'environment'`). Ignora el mismo código dentro de 2000 ms. Si no hay permiso → rechaza con `Error('SIN_CAMARA')`.

Notas que fija el plan:
- Escanear: selector Depósito | Salón (pastilla deslizante, persiste `css.sector`), botón de cámara grande con pulso suave, buscador con resultados en vivo (`buscarTexto`, tocar → ficha), anillo SVG de avance del sector (`avance`).
- Visor: video a pantalla completa, marco con esquinas, línea láser animada, botón linterna (oculto si no hay), cerrar. Al leer: `navigator.vibrate?.(40)`, bip con WebAudio (880 Hz, 80 ms), detener cámara, abrir ficha. Código desconocido: toast "Código 7790… no está en la lista" y abrir buscador con el código escrito.
- `SIN_CAMARA`: mensaje con cómo habilitar el permiso y acceso directo al buscador.

- [ ] **Step 1: Implement**.
- [ ] **Step 2: Verify** en localhost con un catálogo de prueba en `css.catalogo.solymar` (pegar los 3 artículos de la Task 1 desde la consola): el buscador encuentra "lavandina" y "2102"; el selector de sector cambia el anillo; el visor abre la cámara de la PC (o muestra el mensaje SIN_CAMARA) y cierra sin dejar la cámara encendida (indicador del navegador apagado).
- [ ] **Step 3: Commit** `git commit -m "feat: pantalla escanear y visor de camara"`

---

### Task 7: Ficha del artículo

**Files:**
- Create: `js/ui/ficha.js`

**Interfaces:**
- Consumes: `estado.registrarCarga`, `total` (Task 1), `ir`.
- Produces: `abrirFicha(a:Articulo, {desdeVisor:boolean})`.

Notas que fija el plan:
- Hoja inferior con resorte (entra desde abajo, arrastrar hacia abajo la cierra).
- Muestra desc, Cod. Art, precio (`$ 1.785`, formato `es-UY`), códigos; tres números Depósito / Salón / Total (`—` si `null`), el del sector activo resaltado.
- Teclado: dígitos 0–9, borrar, −/+ (paso 1, mínimo 0, máximo 99999). Sin coma.
- Botón principal naranja "Sumar N a Depósito" (deshabilitado con N=0). "Corregir" cambia el modo: el botón pasa a "Dejar Depósito en N" (permite 0) con aviso de que reemplaza. "Comentario" abre un textarea con el comentario actual y "Guardar".
- Cada acción arma la op `{id: crypto.randomUUID(), accion, sucursal, sector, cod, cantidad|valor|texto, usuario}` y llama `registrarCarga`. El número del sector cuenta hasta el valor nuevo (requestAnimationFrame, 500 ms), ✓ dibujado con stroke, y si `desdeVisor` la cámara se reabre a los 700 ms.
- Si la respuesta del script trae `articulo`, reemplaza el optimista (`actualizarArticulo`); si es error, toast rojo con el mensaje y se revierte al valor del servidor.

- [ ] **Step 1: Implement**.
- [ ] **Step 2: Verify** en localhost con `API_URL` vacío (todo queda en la cola): sumar 12 → Depósito pasa de 3 a 15 animado, el indicador muestra "⟳ 1"; corregir a 0 → muestra 0, no "—"; comentario se ve en la ficha; recargar la página mantiene la cola.
- [ ] **Step 3: Commit** `git commit -m "feat: ficha del articulo con teclado y cargas"`

---

### Task 8: Mis cargas y Artículos

**Files:**
- Create: `js/ui/cargas.js`, `js/ui/articulos.js`

**Interfaces:**
- Consumes: `estado` (`cargas`, cola, eventos), `filtrar`, `buscarTexto`, `total`, `abrirFicha`, `api.llamar`.

Notas que fija el plan:
- Mis cargas: une `css.cargas` (con estado local pendiente/guardada/error) y `historial` del script filtrado por `usuario`; ordenado por hora desc; cada fila: hora, descripción, `+12 Depósito` / `= 0 Salón` / `💬`, estado (☁✓ / ⟳ / ⚠). Deshacer: botón en la fila + deslizar a la izquierda; arma op `{accion:'deshacer', id:nuevo, idOriginal}` por la cola. Deshechas se ven tachadas. Pendientes todavía no enviadas se deshacen sacándolas de la cola sin ir al servidor.
- Artículos: KPIs arriba (Contados depósito, Contados salón, Con comentario), chips de filtro, buscador, lista virtualizada simple (renderiza de a 60 al hacer scroll, son ~1.900 artículos) con Depósito / Salón / Total en mono; tocar → ficha.
- Confeti suave (canvas, 1,2 s, colores del logo) la primera vez que `avance` del sector llega a 100% en esta sesión; nada con reduced-motion.

- [ ] **Step 1: Implement**.
- [ ] **Step 2: Verify** en localhost: las cargas de la Task 7 aparecen como pendientes; deshacer una pendiente la saca de la cola y revierte el número; filtros Contados/Sin contar coinciden con los KPIs; el scroll de la lista no se traba con 2.000 artículos de prueba generados por consola.
- [ ] **Step 3: Commit** `git commit -m "feat: mis cargas con deshacer y lista de articulos"`

---

### Task 9: Encargado, PWA y publicación

**Files:**
- Create: `js/ui/encargado.js`, `manifest.json`, `sw.js`, `icons/*.png`, `publicar.bat`, `README.md`

Notas que fija el plan:
- Encargado: pide PIN (input numérico), muestra resumen (contados por sector, con comentario, último movimiento), "Nuevo conteo" → segundo paso que exige escribir el nombre de la sucursal → `nuevoConteo` directo (no por la cola; requiere conexión). Al terminar: muestra el nombre del archivo, borra `css.cargas`, recarga catálogo. `PIN_INCORRECTO` → sacude el input.
- `manifest.json`: nombre "Control Stock Sucursales", corto "Stock", `display:standalone`, `orientation:portrait`, `theme_color:#07090f`, `background_color:#07090f`, iconos derivados del logo (generar los PNG desde `logoSVG` con canvas en el navegador y guardarlos).
- `sw.js`: precachea los archivos de la app con nombre de caché `css-<VERSION>`; las llamadas a `script.google.com` y `script.googleusercontent.com` y el `manifest.json` nunca se cachean.
- `publicar.bat`: ASCII + CRLF, igual que el de Compras: actualiza `VERSION` en `js/config.js` y `sw.js` con fecha-hora, `git add -A`, commit, push.
- README: cómo correr local, puesta en marcha del Apps Script (pasos de la Task 10), cómo publicar.

- [ ] **Step 1: Implement**.
- [ ] **Step 2: Verify** en localhost: Lighthouse/DevTools → Application muestra manifest válido e instalable; con DevTools en offline la app abre desde el caché y las cargas quedan en la cola; `file publicar.bat` reporta CRLF y sin bytes > 0x7F (`grep -P '[^\x00-\x7F]' publicar.bat` sin salida).
- [ ] **Step 3: Commit** `git commit -m "feat: encargado, pwa y script de publicacion"`

---

### Task 10: Puesta en marcha y prueba real (con el usuario)

Requiere la cuenta de Google del dueño de la planilla. Cada paso que toca Drive se confirma con el usuario antes.

- [ ] **Step 1:** Hacer una **copia** de la planilla en Drive ("BALANCE SOLYMAR ALTERNATIVOS — PRUEBA APP").
- [ ] **Step 2:** En la copia: Extensiones → Apps Script, pegar `Code.gs` y `logica.js` (como `Logica.gs`), cargar `PIN_ENCARGADO` en Propiedades del script, ejecutar `instalar()`, publicar como aplicación web (Ejecutar como: yo · Acceso: cualquier persona). Poner la URL `/exec` en `js/config.js`.
- [ ] **Step 3: Verify** contra la copia, desde la app en localhost, revisando celdas y HISTORIAL en la planilla:
  - existen SOLYMAR, MINAS (encabezado `LOCAL MINAS`, fórmulas G/H funcionando) y HISTORIAL; volver a correr `instalar()` no cambia nada.
  - sumar 5 + 7 a 330001 Depósito → E = 12, G = 12, H = `330001,12`, dos filas en HISTORIAL.
  - sumar a 330056 → se escribe solo en la primera de sus 3 filas.
  - corregir a 0 → E = 0 (no vacío); deshacer → vuelve a 12.
  - mismo `id` enviado dos veces (desde la consola con `api.llamar`) → una sola suma, respuesta `repetido:true`.
  - dos pestañas sumando 1 al mismo artículo 20 veces cada una en paralelo → total 40.
  - escribir 7 a mano en la planilla → la app lo muestra en ≤ 60 s.
  - Nuevo conteo con PIN incorrecto → rechazado; con el correcto → pestaña `SOLYMAR dd-MM-yyyy HH.mm` creada, E/F/I en blanco, deshacer una carga anterior → rechazado.
  - Minas: cargar en Minas no toca SOLYMAR.
- [ ] **Step 4:** Probar en un Android y un iPhone reales escaneando 5 productos de cada tipo de código.
- [ ] **Step 5:** Con el ok del usuario: repetir el Step 2 en la planilla real (sin Nuevo conteo), cambiar `API_URL`, crear el repo de GitHub Pages y publicar. Verificar que la URL pública sirve la versión nueva.
- [ ] **Step 6: Commit** `git commit -m "chore: url del script de produccion"`
