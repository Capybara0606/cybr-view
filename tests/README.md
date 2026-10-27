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
