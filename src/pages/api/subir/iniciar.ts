/* Primer paso de una subida: anota el video en la base y devuelve
   el código del link. Todavía no llegó ni un byte del archivo. */

import type { APIRoute } from 'astro';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { haySesion, sinPermiso } from '../../../lib/clave';
import { CONFIG, MAX_BYTES, PEDAZO_BYTES, prepararCarpetas } from '../../../lib/config';
import { crearVideo } from '../../../lib/base';
import { nuevoSlug } from '../../../lib/slug';
import { json, error, leerJson } from '../../../lib/respuestas';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!haySesion(request)) return sinPermiso();

  const cuerpo = await leerJson(request);

  /* Se exige que sea texto de verdad. Con un String() pelado, mandar un objeto
     dejaba guardado el título "[object Object]". */
  const titulo = typeof cuerpo.titulo === 'string' ? cuerpo.titulo.trim().slice(0, 200) : '';
  const bytes = Number(cuerpo.bytes ?? 0);

  if (!titulo) return error('Falta ponerle un título al video.');
  if (!Number.isFinite(bytes) || bytes <= 0) return error('El archivo parece vacío.');
  if (bytes > MAX_BYTES) {
    return error(`El archivo pesa más de ${CONFIG.maxMB} MB, que es el máximo configurado.`);
  }

  prepararCarpetas();

  const slug = nuevoSlug();
  crearVideo(slug, titulo);

  /* Se crea el archivo vacío ahora para que el primer pedazo tenga dónde
     escribirse y para que la validación de posición del pedazo 0 dé cero. */
  await writeFile(path.join(CONFIG.trabajo, `${slug}.origen`), '');

  return json({ slug, pedazo: PEDAZO_BYTES });
};
