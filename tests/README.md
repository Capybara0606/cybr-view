# Verificación

Regresiones del Worker y de la lectura de revisiones (Node.js):

```sh
node --test tests/*.test.mjs
```

Para las pruebas de navegador, iniciar `node server.js` desde la raíz en otra terminal. El entorno de onboarding dispone de Python Playwright, Chromium en `/usr/bin/chromium` y ffmpeg. Las pruebas de UI requieren esas herramientas y usan respuestas controladas; no escriben en Firebase ni dependen de datos de clientes.

```sh
python3 tests/preview-navigation-smoke.py
python3 tests/review-ui-smoke.py
```

La prueba de UI genera su MP4 en un directorio temporal. Para conservar capturas, definir `CYBR_UI_SCREENSHOTS` como directorio de salida. Comprueba cinco tamaños de pantalla, marca KIRU, hilos, filtros, tiempo de respuestas, confirmación de aprobación, gestión exclusiva de editor, recuperación de errores y navegación táctil/teclado. La prueba de navegación cubre compartir enlaces entre contextos independientes y recargar sin almacenamiento local.

Estas pruebas usan Chromium y no sustituyen la comprobación manual en Safari de iPhone, incluido el fullscreen nativo, el teclado y las limitaciones del control de volumen.
