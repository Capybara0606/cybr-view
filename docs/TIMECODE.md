# TIMECODE.md

> Especificación de **timecode / fps / frames** de CYBR VIEW.
> **Criterio maestro: todo lo que es programático se ancla en SEGUNDOS.**
> La cadena de timecode es solo *display*. El seek/playhead siempre es en segundos.

---

## 1. Regla fundamental

| Magnitud | Tipo | Uso |
|----------|------|-----|
| `comment.time` | **number (segundos, float)** | ancla real. Es lo que se usa para `video.currentTime`, `setPlayerPosition()`, `createMarker()`. |
| `comment.frame` | number | frame entero exacto dentro del segundo (precisión). |
| `comment.timeCode` | string | solo para **mostrar** (`00:00:12:12`). Se calcula, nunca es autoritativo. |
| `comment.fps` | number | FPS de la línea que se usa para el display. |

- **Nunca** convertir de string a tiempo para operar.
- **Siempre** convertir de segundos → string para mostrar.
- Premiere (`getPlayerPosition()`, `createMarker()`) y `<video>` (`currentTime`) operan en **segundos**.

---

## 2. Estructura del timecode

Formato: `HH:MM:SS:FF` (no-drop-frame) o `HH:MM:SS;FF` (drop-frame).

- `SS` = segundos (usar `time % 60` con redondeo a entero).
- `FF` = frames = `floor(frac(seconds) * round(fps))`.

## 3. FPS y tipos

### 3.1 Valores a soportar
| `fps` | `timecodeType` | Nota |
|-------|----------------|------|
| 23.98 | NDF | estándar cine; también 24 (entero). |
| 25 | NDF | PAL. |
| 29.97 | DF o NDF | EEUU; DF para difusión. |
| 30 | NDF | entero. |
| 50 | NDF | PAL HD. |
| 59.94 | DF | EEUU HD. |
| 60 | NDF | entero. |

- Guardar el **fps real** del proyecto en `version.fps`.
- Guardar `timecodeType` (`NDF`/`DF`); se deriva de `fps` en la mayoría de casos.

### 3.2 Drop-frame vs Non-drop
- Drop-frame **salta frames** en el conteo para que el reloj corra a velocidad real
  (26/29.97 etc.). El **segundo* es el ancla; no saltamos segundos.
- Al mostrar con DF usamos `;` como separador y ajustamos el *frame count* acumulado para no
  arrastrar deriva, pero **el `time` (segundos) no cambia**.
- Para la mayoría de usos de CYBR VIEW basta con almacenar `time` + `fps` y mostrar con el
  algoritmo DP (drop frame). Si se usa `NDF`, la conversión es directa.

## 4. Algoritmo de conversión (referencia conceptual)

### 4.1 segundos → timeCode (NDF)
```
totalFrames = round(time * fps)
ff = totalFrames % round(fps)
ss = floor(time % 60)
mm = floor(time / 60) % 60
hh = floor(time / 3600)
timeCode = pad(hh) + ":" + pad(mm) + ":" + pad(ss) + ":" + pad(ff)
```

### 4.2 segundos → timeCode (DF, para 29.97/59.94)
```
totalFrames = round(time * fps)
DROP = round(fps * 0.066666)          // ~2 frames por minuto (29.97), 4 para 59.94
framesPerHour = round(fps * 3600)
framesPer24Hours = framesPerHour * 24
framesPer10Minutes = round(fps * 600)
framesPerMinute = round(fps*60) - DROP

if totalFrames < 0: totalFrames = 0
d = totalFrames / framesPer24Hours
m = totalFrames % framesPer24Hours
if m < framesPer10Minutes:
    tenMinuteFrames = round(fps * 600)
else:
    tenMinuteFrames = round(fps*600) + ((m - framesPer10Minutes) / framesPerMinute) * DROP
totalFrames += d * 10 * DROP + tenMinuteFrames * 0      // (solamente el offset de display)
...  // el cálculo completo se detalla y testea al implementar
timeCode = pad(hh) + ":" + pad(mm) + ":" + pad(ss) + ";" + pad(ff)
```

> El bloque DF se implementa y **testea con casos conocidos** (1h00m00;00 y 1h00m00;02 etc.)
> en la FASE 2/3. Para el MVP con 23.98/25/30 es suficiente el NDF.

## 5. Mapa semántico Web ↔ Premiere

| Momento | Web (`<video>`) | Premiere (ExtendScript) | CYBR VIEW |
|---------|-----------------|--------------------------|-----------|
| Playhead | `video.currentTime` (s) | `sequence.getPlayerPosition()` (s) | `comment.time` (s) |
| Duración | `video.duration` (s) | `sequence.end` / `getInPoint/OutPoint` | `version.duration` |
| FPS | — | `sequence.timebase.toString()` o `RealFPS` | `version.fps` |
| Timecode display | calculado | `sequence.getTimecode(time)` | `comment.timeCode` |
| Crear marcador | — | `sequence.markers.createMarker(timeInSeconds)` | — |
| Mover playhead | `video.currentTime = t` | `sequence.setPlayerPosition(t)` | — |

> ⚠️ **Divergencia posible:** el *timecode de la secuencia* no siempre coincide con el
> *tiempo del archivo de video* (p.ej. un clip que empieza en `00:01:00:00`, o un `timecode`
> embebido distinto). **CYBR VIEW ancla al TIEMPO DE SECUENCIA (playhead en segundos)**, no
> al timecode embebido del archivo. Esto es una decisión de diseño (ADR) para que web y CEP
> coincidan exactamente. Documentamos aquí para no confundir en la FASE 6/7.

## 6. Cliente reproductor (Web) — captura del tiempo

- La Web captura `time` en el `timeupdate`/`seeked` del `<video>` (no en el frame).
- Al escribir un comentario: se lee `video.currentTime` → `time`. Se calcula `frame` y `timeCode`.
- Precisión: redondear a `time` al frame más próximo (`round(time * fps) / fps`) para que el
  playhead y el comentario caigan en el mismo frame, y que `createMarker(time)` en Premiere
  caiga exactamente en el mismo frame que `setPlayerPosition(time)`.

## 7. Redondeo / precisión

- **Ancla:** `time` en segundos redondeada al frame (`round(time*fps)/fps`) → coincide con Premiere.
- `frame` = resto tras quitar segundos.
- Emplear **números**, nunca strings, en todo cálculo. Los strings de timecode solo para UI.

## 8. Errores a evitar (checklist)

- [ ] Operar con `timeCode` como si fuera un número.
- [ ] Ignorar el `fps` (p.ej. asumir 30 por defecto).
- [ ] Confundir `time` de película con el `timecode` embebido del archivo.
- [ ] Usar `getPlayerPosition()` y `currentTime` con unidades distintas (ambos son segundos, pero la escala de Premiere es la del timeline).
- [ ] No redondear al frame → playhead y marcador caen en frames distintos.
