/* ============================================================
   ARRANQUE LOCAL (solo para probar en la compu, no se usa en el servidor)

   Levanta exactamente el mismo servidor que va a correr en el VPS, pero
   con una contraseña de prueba y guardando los videos en una carpeta de
   acá al lado (datos-local/), que está fuera de git.

   Probar el servidor ya compilado, y no el modo desarrollo, es a propósito:
   así lo que se prueba es lo mismo que se va a publicar.

   Se usa: npm run build  y después  npm run local
   ============================================================ */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

process.env.CLAVE_ADMIN ??= 'prueba';
process.env.CARPETA_DATOS ??= path.join(raiz, 'datos-local');
process.env.HOST ??= '127.0.0.1';
/* 4322 y no 4321 para poder tener la web principal levantada al mismo tiempo. */
process.env.PORT ??= '4322';

/* Menos videos que en el servidor, para que se note el borrado automático
   sin tener que subir cinco archivos. */
process.env.MAX_VIDEOS ??= '3';

/* En el servidor ffmpeg vive adentro del contenedor y se encuentra solo. Acá,
   si se instaló recién con winget, la carpeta todavía no está en el PATH de
   esta ventana (Windows lo actualiza recién al reiniciar la sesión). Así que
   la buscamos nosotros. */
if (process.platform === 'win32' && !process.env.FFMPEG_RUTA) {
  const links = path.join(
    process.env.LOCALAPPDATA ?? '',
    'Microsoft', 'WinGet', 'Links',
  );
  if (existsSync(path.join(links, 'ffmpeg.exe'))) {
    process.env.FFMPEG_RUTA = path.join(links, 'ffmpeg.exe');
    process.env.FFPROBE_RUTA = path.join(links, 'ffprobe.exe');
    console.log('  ffmpeg:     %s', process.env.FFMPEG_RUTA);
  }
}

console.log('');
console.log('  Panel:      http://localhost:%s/admin', process.env.PORT);
console.log('  Contraseña: %s', process.env.CLAVE_ADMIN);
console.log('  Datos en:   %s', process.env.CARPETA_DATOS);
console.log('');

/* pathToFileURL y no la ruta pelada: en Windows, importar "D:\algo\x.mjs" falla
   porque Node lee la "D:" como si fuera un protocolo de internet. */
await import(pathToFileURL(path.join(raiz, 'dist', 'server', 'entry.mjs')).href);
