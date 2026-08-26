# CEP-ARCHITECTURE.md

> Arquitectura de la extensión **CEP de Adobe Premiere Pro** para CYBR VIEW.
> Sigue el patrón de los proyectos existentes de la carpeta contenedora (`PremiereCleanup`,
> `MotionCapy`): `manifest.xml` + `index.html` + `hostscript.jsx` + `CSInterface.js`.

---

## 1. Estructura

```
cep/
├── CSXS/
│   └── manifest.xml         <- descripción (Host PPRO, versión, tamaño del panel)
├── index.html
├── css/
│   └── panel.css
├── js/
│   ├── main.js              <- lógica del panel (UI + CSInterface + SDK Firebase)
│   ├── sync.js              <- suscripciones a Firebase (comentarios/estado)
│   └── CSInterface.js       <- (incluido en build; lo provee Adobe o el repo)
├── jsx/
│   ├── main.jsx             <- funciones de puente, registro, logging
│   ├── markers.jsx          <- crear/actualizar/borrar/listar marcadores
│   └── player.jsx           <- playhead (get/set), secuencia activa, timecode
└── INSTALL.txt              <- pasos de instalación / despliegue
```

> **Nota sobre CSInterface.js:** debe estar presente junto al panel (no desde CDN, y el
> CEF no permite cargarlo de un origen remoto). Se descarga de
> `https://github.com/Adobe-CEP/CEP-Resources`.

---

## 2. manifest.xml (referencia)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExtensionManifest xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    ExtensionBundleId="com.kiru.cybrview"
    ExtensionBundleVersion="1.0.0"
    ExtensionBundleName="CYBR VIEW">
  <ExtensionList>
    <Extension Id="com.kiru.cybrview.panel" Version="1.0.0" />
  </ExtensionList>
  <ExecutionEnvironment>
    <HostList>
      <Host Name="PPRO" Version="[14.0,99.9]" />
    </HostList>
    <LocaleList><Locale Code="All" /></LocaleList>
    <RequiredRuntimeList>
      <RequiredRuntime Name="CSXS" Version="9.0" />
    </RequiredRuntimeList>
  </ExecutionEnvironment>
  <DispatchInfoList>
    <Extension Id="com.kiru.cybrview.panel">
      <DispatchInfo>
        <Resources>
          <MainPath>./index.html</MainPath>
          <ScriptPath>./hostscript.jsx</ScriptPath>
          <CEFCommandLine>
            <Parameter>--allow-file-access-from-files</Parameter>
            <Parameter>--allow-file-access</Parameter>
          </CEFCommandLine>
        </Resources>
        <Lifecycle><AutoVisible>true</AutoVisible></Lifecycle>
        <UI>
          <Type>Panel</Type>
          <Menu>CYBR VIEW</Menu>
          <Geometry>
            <Size><Height>420</Height><Width>360</Width></Size>
          </Geometry>
          <Icons />
        </UI>
      </DispatchInfo>
    </Extension>
  </DispatchInfoList>
</ExtensionManifest>
```

> Íconos opcionales: `<Icons><Icon Id="panel" Type="Normal">...</Icon></Icons>`.

---

## 3. Comunicación panel ↔ ExtendScript

El **panel** (JS en CEF) habla con Premiere vía `CSInterface.evalScript()`.

```
const cs = new CSInterface();
cs.evalScript('cybr.getActiveSequence()', (result) => {
  const seq = JSON.parse(result);
  ...
});
```

- `evalScript` es **asíncrono y entrega el resultado como STRING**. Hay que `JSON.stringify'
  en el `.jsx` y `JSON.parse` en el panel.
- Evitar pasar objetos "por valor" grandes => máximo ~32 a 64KB de retorno.
- Localizar el panel consigo mismo: `cs.getSystemPath(SystemPath.EXTENSION)`, `cs.getHostEnvironment()`.

---

## 4. ExtendScript (ES3) — qué hace y qué no

**El `.jsx` es ES3 y NO tiene red ni `fetch`.** Por eso:

- **NO** hacer Firebase desde el `.jsx`.
- La **suscripción/escritura a Firebase la hace `sync.js` en el panel** (CEF sí tiene red).
- El `.jsx` **solo** maneja Premiere: leer secuencia, playhead, tiempo, marcadores.

```js
// jsx/main.jsx
function cybr_getProject() {
  var p = app.project;
  if (!p) return JSON.stringify({ error: 'No hay proyecto' });
  return JSON.stringify({ name: p.name, filePath: p.fileName, root: p.rootItem.name });
}

function cybr_getActiveSequence() {
  var seq = app.project.activeSequence;
  if (!seq) return JSON.stringify({ error: 'No hay secuencia activa' });
  return JSON.stringify({
    nodeId: seq.nodeId,
    name: seq.name,
    fps: seq.timebase.toString(),
    timecodeType: seq.timecodeType || (seq.timebase < 30 ? 'NDF' : 'DF'),
    end: seq.end,
    inPoint: seq.getInPoint()
  });
}
```

### 4.1 Mover playhead
```js
function cybr_setPlayhead(timeInSeconds) {
  var seq = app.project.activeSequence;
  if (!seq) return JSON.stringify({ error: 'No hay secuencia activa' });
  seq.setPlayerPosition(timeInSeconds);
  return JSON.stringify({ ok: true, time: timeInSeconds });
}
```

### 4.2 Crear / listar / actualizar / borrar marcadores
```js
function cybr_createMarker(timeInSeconds, name, comment) {
  var seq = app.project.activeSequence;
  if (!seq) return JSON.stringify({ error: 'No hay secuencia activa' });
  var m = seq.markers.createMarker(timeInSeconds);
  m.name = 'CYBR::' + name;      // naming con el commentId
  m.comments = comment || '';
  return JSON.stringify({ ok: true, id: m.guid });
}
```

> El `name` de los marcadores es la clave para **mapear `commentId ↔ marker`**. Mantener un
> prefijo `CYBR::<commentId>` (o almacenar `<commentId>` en `comments`). Al resolver un
> comentario, `markers.jsx` busca el marcador con ese nombre y lo actualiza/elimina.

---

## 5. Autenticación del editor (token) — importante

**Nunca** incrustar credenciales de service account en el panel.
- **Opción A (recomendada):** el editor inicia sesión en la **Web** (email/password) y copia
  un **token** (JWT de Firebase) → el panel lo guarda y lo usa para `signInWithCustomToken`
  (a través de una Cloud Function de intercambio) o por token efímero emitido por el Web.
- **Opción B:** el panel pide email/password directo (login en el CEF). Es más simple pero
  menos controlado y peor para una experiencia de editor.
- El popup OAuth dentro de CEF (Google) es problemático (ventanas emergentes bloqueadas en el
  CEF), por eso se opta por **token copiado del Web** para la FASE 5/6.

---

## 6. Debug / despliegue (instalación)

- **Para desarrollo:** activar `PlayerDebugMode` en el registro de Windows:
  `HKEY_CURRENT_USER\Software\Adobe\CSXS.9` (o la versión del runtime) → `PlayerDebugMode=1`,
  y reiniciar Premiere. Ver `INSTALL.txt`.
- **Para producción:** la extensión debe estar **firmada** (o en la ACL de extensiones de
  confianza de Adobe). Preferir firmar con un cert de Adobe para eliminar el `PlayerDebugMode`.
- Localización del panel: `Window > Extensions > CYBR VIEW`.

---

## 7. Seguridad (CSP del panel)

El panel carga `index.html` y scripts locales. Añadir `Content-Security-Policy` en el `<head>`:
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self' file:; connect-src https://*.firebaseio.com https://firestore.googleapis.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'" />
```
> Ajustar los hosts de Firebase (Realtime DB: `https://<project>.firebaseio.com` y
> websockets `wss://<project>.firebaseio.com`) para el `connect-src`.

---

## 8. Notas / riesgos de CEP
- **Routing de rutas** para `/review/:id` (el panel no tiene router web; usar parámetros intro).
- **CEF y `file://`** pueden fallar con módulos ES6 en algunos escenarios (el CEF puede no
  aceptar `import` si no hay flag). En ese caso usar scripts clásicos concatenados
  (ver `shared/` por copia en `AGENTS.md`), o el panel se entrega ya concatenado.
- **El panel debe ser resiliente** cuando no hay secuencia activa (mostrar estado `NO SEQUENCE`).
- **Los marcadores** se crean en la **secuencia activa**, no en el proyecto. Si el editor
  cambia de secuencia, hay que re-vincular (FASE 7).
