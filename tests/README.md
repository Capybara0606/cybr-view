# Verificación

Regresiones del Worker y de la lectura de revisiones (Node.js):

```sh
node --test tests/*.test.mjs
```

Para las pruebas de navegador, iniciar `node server.js` desde la raíz en otra terminal. El entorno de onboarding dispone de Python Playwright, Chromium en `/usr/bin/chromium` y ffmpeg. Las pruebas de UI requieren esas herramientas y usan respuestas controladas; no escriben en Firebase ni dependen de datos de clientes.

```sh
python3 tests/preview-navigation-smoke.py
python3 tests/review-ui-smoke.py
python3 tests/touch-seek-smoke.py
python3 tests/production-review-smoke.py
```

La prueba de UI genera su MP4 en un directorio temporal. Para conservar capturas, definir `CYBR_UI_SCREENSHOTS` como directorio de salida. Comprueba cinco tamaños de pantalla, marca KIRU alineada, selección por tarjeta, tachado de resueltos, edición y eliminación con persistencia, conservación del borrador y del tiempo, iconos, filtros, confirmación de aprobación, gestión exclusiva de editor, recuperación de errores y navegación táctil/teclado. La prueba de navegación cubre compartir enlaces entre contextos independientes y recargar sin almacenamiento local.

La prueba táctil utiliza eventos de toque del navegador (CDP) para arrastrar hacia delante/atrás, tocar la pista, cancelar un gesto y buscar mientras se reproduce. Verifica tanto la posición real del video como la previsualización.

Estas pruebas usan Chromium y no sustituyen la comprobación manual en Safari de iPhone, incluido el fullscreen nativo, el teclado y las limitaciones del control de volumen.

La prueba de producción usa el SDK Firebase simulado (sin datos ni credenciales reales), abre el enlace sin flags de DEV y comprueba escrituras correctas, errores de red sin falsos éxitos y lectura de la aprobación al recargar.

Navegación pública de versiones, sincronización de enlaces antiguos, creación y
publicación, aislamiento de datos y recarga en otro navegador (Firebase simulado):

```sh
python3 tests/version-navigation-smoke.py
```

Para validar los permisos reales con el emulador RTDB (sin credenciales ni datos de
producción), instalar Firebase CLI fuera del checkout e iniciar el emulador con
proyecto `demo-cybr-view`, reglas `database.rules.json` y puerto 9000. Después:

```sh
FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000 node tests/firebase-rules-smoke.mjs
```

Esta comprobación es independiente de las pruebas con SDK simulado. Necesita
Java y el artefacto oficial del emulador de `storage.googleapis.com`. El script
rechaza destinos que no sean `127.0.0.1` y solo usa el namespace `demo-cybr-view`.
