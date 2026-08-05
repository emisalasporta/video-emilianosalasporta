/* Último paso de la subida: el archivo ya llegó entero, así que se
   manda a la cola de conversión y se contesta EN EL ACTO.

   Es importante que esta respuesta salga ya: convertir tarda minutos y
   si dejáramos la petición esperando, el navegador la cortaría mucho
   antes. El panel se entera de cómo viene preguntando cada tanto
   por /api/videos. */

import type { APIRoute } from 'astro';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { haySesion, sinPermiso } from '../../../lib/clave';
import { CONFIG } from '../../../lib/config';
import { buscarVideo, marcarEstado } from '../../../lib/base';
import { slugValido } from '../../../lib/slug';
import { encolar } from '../../../lib/convertir';
import { json, error, leerJson } from '../../../lib/respuestas';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!haySesion(request)) return sinPermiso();

  const { slug } = await leerJson(request);
  if (!slugValido(slug)) return error('Código de video inválido.');

  const video = buscarVideo(slug);
  if (!video) return error('Ese video no existe.', 404);
  if (video.estado !== 'subiendo') return error('Esa subida ya se cerró.', 409);

  const archivo = path.join(CONFIG.trabajo, `${slug}.origen`);

  let peso: number;
  try {
    peso = (await stat(archivo)).size;
  } catch {
    marcarEstado(slug, 'error', 'No llegó el archivo.');
    return error('No llegó el archivo.', 410);
  }

  if (peso === 0) {
    marcarEstado(slug, 'error', 'El archivo llegó vacío.');
    return error('El archivo llegó vacío.');
  }

  marcarEstado(slug, 'convirtiendo');
  encolar(slug, archivo);

  return json({ ok: true, slug });
};
