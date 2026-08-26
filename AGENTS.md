# CYBR VIEW — AGENTS.md

> **PRODUCT:** CYBR VIEW
> **BRAND:** KIRU
> **TAGLINE:** VIDEO REVIEW // SYSTEM
>
> Guía de referencia para agentes de IA / contribuidores que trabajan en este proyecto.
> Esta es la fuente normativa. Léela completa antes de escribir o modificar código.

---

## 1. Qué es esto

CYBR VIEW es una plataforma profesional de **revisión de videos** creada por **KIRU**.
Permite que un cliente revise una versión de video en un navegador y deje comentarios
asociados automáticamente a un *timecode*, mientras un editor los ve **en tiempo real
dentro de Adobe Premiere Pro** y los convierte en marcadores del timeline.

```
CLIENTE
   ↓
CYBR VIEW WEB (navegador / reproductor + comentarios)
   ↓
FIREBASE  ←── fuente central de verdad (single source of truth)
   ↓
CYBR VIEW CEP PANEL (extensión Premiere Pro)
   ↓
EXTENDSCRIPT (hostscript.jsx)
   ↓
ADOBE PREMIERE PRO (playhead + marcadores)
```

## 2. Estado de desarrollo

**FASES 0–5.5 completas** (arquitectura, reproductor, comentarios con timecode, Firebase
RTDB, proyectos/versiones y MVP web estático publicado en GitHub Pages).
Ver `ARCHITECTURE.md` y `ROADMAP.md`.
**Siguiente:** autenticación / CEP / Premiere (según roadmap). No adelantar fases.

## 3. Stack (decidido, no negociable)

| Capa | Tecnología |
|------|------------|
| Web (cliente) | HTML · CSS · **Vanilla JS (ES Modules)** · Firebase Web SDK modular v9+ |
| Backend | Firebase **Realtime Database** · Firebase **Authentication** |
| Premiere | CEP (`manifest.xml`) · HTML · CSS · JS · **ExtendScript** (`*.jsx`, ES3) · `CSInterface.js` |
| Video | **Proxy de revisión** en Google Drive (MP4/H.264/AAC, 720p–1080p, **máx 160 MB**). Se sirve **directo** desde la URL de Drive, **sin servidor/proxy intermedio**. El master queda fuera. |

Registro de decisiones de arquitectura (ADR) en `docs/DECISIONS.md`.

## 4. Estructura de carpetas (mapa)

```
cybr-view/
├── AGENTS.md                 <- este archivo
├── ARCHITECTURE.md           <- arquitectura completa
├── ROADMAP.md                <- plan por fases
├── CHANGELOG.md              <- bitácora de versiones
├── .gitignore
├── docs/                     <- especificaciones de soporte
│   ├── DATA-MODEL.md         <- modelo de datos / esquema Firebase (fuente única)
│   ├── FIREBASE-RULES.md     <- reglas de seguridad Realtime Database
│   ├── TIMECODE.md           <- spec de timecode / fps / frames
│   ├── VIDEO-PIPELINE.md     <- fuentes de video, formatos, CORS, CDN
│   ├── CEP-ARCHITECTURE.md   <- detalle de la extensión CEP + ExtendScript
│   ├── SYNC-SPEC.md          <- contrato de sincronización real-time
│   └── DECISIONS.md          <- Registro de decisiones (ADR)
├── shared/                   <- constantes y utilidades compartidas entre Web y CEP
│   ├── constants.js          <- identidad, tokens, enums
│   └── schemas.js            <- helpers de validación de entidades (comparten forma)
├── web/                      <- CYBR VIEW WEB (interfaz del cliente)
│   ├── index.html
│   ├── css/
│   │   └── tokens.css        <- design tokens (colores, tipografía, spacing)
│   ├── js/
│   │   ├── app.js            <- bootstrap / enrutado
│   │   ├── router.js         <- resuelve /review/:id
│   │   ├── state.js          <- estado local + suscripciones Firebase (tienda)
│   │   ├── player.js         <- reproductor <video> (play/pause/seek/tiempo)
│   │   ├── comments.js       <- render + CRUD de comentarios (hilo, reply, resolve)
│   │   └── firebase.js       <- inicialización SDK modular
│   └── assets/
└── cep/                      <- CYBR VIEW CEP PANEL (dentro de Premiere)
    ├── CSXS/
    │   └── manifest.xml      <- descripción de la extensión (Host PPRO)
    ├── index.html
    ├── css/
    │   └── panel.css
    ├── js/
    │   ├── main.js           <- lógica del panel (UI + CSInterface)
    │   ├── sync.js           <- suscripciones Firebase desde el panel
    │   └── CSInterface.js    <- (incluido en build)
    ├── jsx/
    │   ├── main.jsx          <- puente ExtendScript (exportado vía evalScript)
    │   ├── markers.jsx       <- crear/actualizar/eliminar marcadores
    │   └── player.jsx        <- mover playhead, leer timecode
    └── INSTALL.txt
```

> **Regla de despliegue:** `web/` y `cep/` son los únicos artefactos desplegables.
> `shared/` se resuelve por copia en build (ver Convención 6).

## 5. Identidad visual — Design Tokens

Estética: **CYBER BRUTALIST · TECHNICAL EDITORIAL · DIGITAL SYSTEM UI**.
Nada de glassmorphism, ni dashboards SaaS genéricos, ni radio excesivo, ni gradientes
o sombras suaves. La interfaz debe sentirse como una herramienta de postproducción.

| Token | Valor | Uso |
|-------|-------|-----|
| `--bg` | `#050505` | fondo dominante |
| `--surface` | `#0A0A0A` | superficies / paneles |
| `--border` | `#262626` | líneas, grids, bordes finos |
| `--green` | `#1DB954` | **color KIRU** — acento/protocolo |
| `--text` | `#F2F2F2` | texto principal |
| `--muted` | `#8A8A8A` | texto secundario / metadata |
| `--danger` | `#FF3B30` | error / resolución / peligro |

Principios visuales que SIEMPRE deben respetarse:
- Negro dominante, superficies casi-negras, borde `1px` fino.
- Grids y líneas técnicas de guía. Estética editorial de metadata.
- Labels **uppercase**, monoespaciada para números/ids/timecodes.
- Numeración de módulos: `/01` `/02` `/03`.
- Microanimaciones de estado (bordes/indicadores), contraste fuerte.
- Interfaces rectangulares (border-radius ≤ 2px, salvo controles mínimos).

## 6. Convenciones / Reglas de código

1. **Lenguaje de interfaz:** español para UI de clientes (es-ES). Identificadores de
   código, claves de datos y nombres de módulos en inglés (camelCase / snake_case).
2. **Vanilla JS:** sin frameworks, sin Node ni npm como dependencia de runtime para el
   web. Nada de build obligatorio para el web salvo resolución de `shared/`.
   Para el CEP (CEF) se tolera JS ES5/ES6 **unbundled** (ver `docs/CEP-ARCHITECTURE.md`).
3. **Modulación web:** ES Modules (`type="module"`). Código limpio, sin IIFE en `web/`.
4. **Comentarios en código:** SOLO cuando aportan aclaración. Nada de ruido.
5. **No introducir libs nuevas sin ADR** en `docs/DECISIONS.md`.
6. **`shared/` se resuelve por copia** en build (cada runtime, Web y CEP, incluye su
   propia copia de `shared/`). No hay paquete compartido npm: `shared/` son archivos
   con formato ES-module-compatible; el CEP los consume vía un paso de concatenación.
7. **Fuente de verdad única:** Firebase Realtime Database. Ningún runtime (Web/CEP)
   guarda estado canónico del producto en local; el estado local es solo *caché*.
8. **Firebase:** usar siempre el **SDK modular v9+**. Nunca `firebase-app` clásico.
9. **Timecode:** se guardan SIEMPRE ambos: `timeCode` (string display) y `time` (segundos,
   número). Todo seek/playhead se hace con **segundos**, no con strings. Ver `docs/TIMECODE.md`.
10. **Nunca** commitear secretos: `firebase-config.js` real NUNCA se versiona. Usar
    `config.example.js` y `.gitignore`. Ver Convención 5 de la sección de seguridad.

## 7. Seguridad / secretos

- Los SDK keys de Firebase (config pública) no son secretos, pero se inyectan por
  `config.js` ignorado en git (`.gitignore`).
- Las credenciales de servicio de Firebase **jamás** van al cliente nativo ni al CEP.
- El CEP autentica con un **token de editor** emitido por la Web (ver `docs/CEP-ARCHITECTURE.md`),
  nunca con un token de servicio (service account) incrustado en el panel.
- Realtime Database protegida con reglas (ver `docs/FIREBASE-RULES.md`). Solo usuarios
  autenticados (role `editor`/`client`) leen/escriben según perfil.

## 8. Verificación

- No hay suite de tests automatizada en esta fase.
- Verificación manual: abrir `web/index.html` con servidor estático local
  (`npx serve web` o similar) y el panel vía PPRO con `PlayerDebugMode` activado.
- Antes de marcar una tarea como completa en `ROADMAP.md`, revisar criterios de
  aceptación de la fase.
- El estado de la extensión se comprueba con los logs de ExtendScript (`$.writeln`)
  visibles en el panel de consola de Premiere (depuración habilitada).

## 9. Flujo de trabajo

- Este repo **no es git** en la raíz (carpeta contenedora). CYBR VIEW vive en `cybr-view/`
  y puede tener su propio repo git al iniciar la FASE 1.
- Trabajar SIEMPRE en la fase indicada en `ROADMAP.md`. No adelantar fases.
- Cualquier cambio de arquitectura se documenta como nuevo ADR en `docs/DECISIONS.md`
  y se refleja en `ARCHITECTURE.md`. 
- Editar `CHANGELOG.md` con cada cambio relevante.

## 10. Reglas de video (OFICIAL)

- **Almacenamiento:** Google Drive. CYBR VIEW solo recibe **proxies de revisión**; el
  **master** permanece fuera de CYBR VIEW.
- **Tamaño máximo:** `MAX_VIDEO_SIZE_MB = 160` (constante central en `shared/constants.js`).
  Nunca considerar como video válido de revisión un archivo **> 160 MB**.
- **Especificación recomendada:** contenedor **MP4** · códec de video **H.264** · códec de
  audio **AAC** · resolución **1080p** (720p aceptable).
- **Entrega:** el navegador carga el proxy **directamente** desde la URL de Google Drive
  configurada. **NO** se introduce ningún servidor intermedio de video:
  - sin servidor de video Node.js;
  - sin proxy en Vercel;
  - sin proxy Cloudflare Worker;
  - sin backend de streaming custom;
  - sin servidor de transcodificación.
- **Validación de tamaño:** preferir validar los metadatos antes de reproducir cuando sea
  técnicamente posible. Si el navegador no puede determinar de forma fiable el tamaño remoto
  antes de cargar, **no** implementar una comprobación frágil de tamaño en el cliente; en su
  lugar: documentar el requisito, mostrar un mensaje claro en la UI y validar en el flujo de
  subida/preparación cuando exista.
