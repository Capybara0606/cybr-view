# VIDEO-PIPELINE.md

> Cómo se maneja el video en CYBR VIEW.
> Decisión: **el video NO vive en Firebase.** Vive en un proveedor externo a través de una
> **URL configurable**. Firebase solo guarda la referencia (`version.videoUrl`) y la metadata.

---

## 1. Principio

```
version.videoUrl  ──►  <video src="..." />  /  proveedor externo
version.videoSource  ──►  enum del proveedor (drive | s3 | b2 | cloudflare_stream | mux | vimeo)
```

- La Web construye el `<video>` a partir de `version.videoUrl`.
- No hay subida de archivos a Firebase en esta fase.
- Se define un **adaptador `videoSource`** para poder cambiar de proveedor sin tocar la lógica
  de comentarios/reproductor.

---

## 2. Contrato de la URL de video

La URL debe cumplir (si no, buscar alternativa):

| Requisito | Por qué | Cómo validar |
|-----------|---------|--------------|
| **MP4 H.264/AAC** | Compatibilidad de navegador. | `file --mime-type` / `curl -I`. |
| **HTTPS** | Sin autoplay/security y sin problemas de contexto seguro. | — |
| **HTTP Range (Accept-Ranges: bytes / 206)** | Navegador **no puede buscar** el clip sin Range. Se puede activar seek indirecto con blob, pero es frágil. | `curl -I -H "Range: bytes=0-1"`. |
| **CORS (Access-Control-Allow-Origin)** | Para features cruzadas (canvas, analítica, `crossOrigin`). Sin CORS, el video sigue reproduciéndose (si no se pide `crossOrigin`), pero se pierden funciones. | `curl -I -H "Origin: https://..."`. |
| **Sin auth o con URL firmada** | Un `<video>` no manda cabeceras `Authorization` custom. | — |
| **Sin expiración corta** | Un enlace que caduca a las horas rompe la revisión. | Config expiración larga o renovable. |

---

## 3. Proveedores (matriz)

| Proveedor | CORS | Range | Notas |
|-----------|------|-------|-------|
| **Google Drive** | ❌ problemático | ❌ para cualquiera | Sirve como fuente **dev**, con límites de tráfico, expiración y no CORS real. **No apto como CDN de producción.** |
| **S3 (AWS / MinIO)** | ✅ configurable | ✅ | Exige bucket + política CORS + URLs firmadas. Muy fiable. |
| **Backblaze B2** | ✅ configurable | ✅ | Buena opción de coste; fácil de montar como CDN. |
| **Cloudflare Stream** | ✅ | ✅ | Transcode automático, presets de calidad, buena integración. |
| **Mux** | ✅ | ✅ | Video API moderna, streaming, generación de thumbnails. Pensado para este caso de uso en contexto de producción. |
| **Vimeo** | ✅ | ✅ | Embed/player; requiere licencia/plan de negocio para revisión privada. |

> **Recomendación para producción:** Backblaze B2 o Cloudflare Stream (CDN barata) sobre
> Google Drive. El adaptador `videoSource` mantiene la puerta abierta a cualquiera.

---

## 4. Componente adaptador `videoSource`

### 4.1 Interfaz conceptual (para FASE 8)
```js
// shared/adapters/videoSource.js  (fase 8)
const videoSource = {
  from: (version) => {
    switch (version.videoSource) {
      case 'b2':          return buildB2Url(version.videoUrl);   // firma/token
      case 'cloudflare':  return buildStreamUrl(version.videoUrl);
      case 'drive':       return buildDriveUrl(version.videoUrl); // dev
      default:            return version.videoUrl;               // 'url' simple
    }
  },
  id: (version) => version.videoSource || 'url'
};
```

### 4.2 Por qué
- Aislar la lógica del proveedor (`buildDriveUrl`, firma de S3…) para que **cambiar de
  CDN no toque** `player.js` ni `comments.js`.
- Mantener `version.videoSource` como fuente de verdad del proveedor.
- A futuro: pedir presets (720p/1080p), tokens firmados, DRM simple, o múltiples streams.

---

## 5. Integración en el reproductor (FASE 1)

```
<video id="player" controls preload="metadata" poster="..." src="..."></video>
```

- `preload="metadata"` → carga la metadata para pintar la barra de tiempo sin bajar todo.
- `controls` nativo o **controles custom** cyber-brutalistas (recomendado).
- `crossOrigin` solo si se usan features que lo piden (canvas/analytics).
- Usar `muted` en autoplay (si se autoplaya) para evitar bloqueos; normalmente se inicia por click.

---

## 6. Playback / plataformas

| Situación | Comportamiento |
|-----------|----------------|
| **Autoplay con audio** | Bloqueado por el navegador → el cliente pincha "play". |
| **Video largo / streaming** | Depende del soporte del servidor (Range/Chunk). |
| **Formato no MP4** (MOV, ProRes, MXF) | No reproducible en navegador. Necesita transcode a MP4/H.264. Considerar `mediainfo`/handbrake previo a subir. |
| **Seek en grandes videos** | Requiere Range requests. Sin Range → descarga completa antes de buscar (mala experiencia). |

---

## 7. Placeholder / sin video

- Si `videoUrl` no está o es de un proveedor no válido, el reproductor muestra un estado
  `NO SIGNAL` / "VIDEO OFFLINE" (acorde a la estética), no rompe.
- Comprobar validez de la URL (HTTPS + formato) con una función simple al cargar la versión.

---

## 8. Problemas / notas de implementación (FASE 8)
- **Firma de URLs:** si el bucket es privado, el web necesita una URL firmada (S3 pre-signed o
  B2 auth token). Esto implica pequeña lógica server (Cloud Function) o token largo.
- **Transcode:** proponer a KIRU un paso previo: subir **MP4 H.264 + AAC en 720p/1080p**
  para máxima compatibilidad. Documentar en `INSTALL` del pipeline.
- **THUMBNAIL/POSTER:** usar `posterUrl` (opcional) para mostrar carátula antes del play.
