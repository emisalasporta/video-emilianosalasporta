/* Borra un video: el archivo del disco y su fila en la base. */

import type { APIRoute } from 'astro';
import { haySesion, sinPermiso } from '../../lib/clave';
import { buscarVideo, borrarFila } from '../../lib/base';
import { borrarArchivosDe } from '../../lib/convertir';
import { slugValido } from '../../lib/slug';
import { json, error, leerJson } from '../../lib/respuestas';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!haySesion(request)) return sinPermiso();

  const { slug } = await leerJson(request);
  if (!slugValido(slug)) return error('Código de video inválido.');

  const video = buscarVideo(slug);
  if (!video) return error('Ese video no existe.', 404);

  /* Primero el archivo, después la fila. Si se hiciera al revés y fallara el
     borrado del archivo, quedaría un MP4 huérfano ocupando disco sin que nadie
     sepa que está ahí. */
  await borrarArchivosDe(slug);
  borrarFila(slug);

  return json({ ok: true });
};
