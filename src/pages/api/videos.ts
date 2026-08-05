/* El listado del panel: qué hay en el cajón y cómo viene cada cosa.
   El panel lo pide al abrirse y después cada pocos segundos mientras
   haya algo convirtiéndose. */

import type { APIRoute } from 'astro';
import { haySesion, sinPermiso } from '../../lib/clave';
import { CONFIG } from '../../lib/config';
import { listarVideos } from '../../lib/base';
import { progresoDe, pesoDelCajon, limpiarSubidasAbandonadas } from '../../lib/convertir';
import { estadoDelVolumen } from '../../lib/volumen';
import { json } from '../../lib/respuestas';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (!haySesion(request)) return sinPermiso();

  /* Aprovechamos que alguien está mirando el panel para sacar del medio las
     subidas que quedaron por la mitad hace horas. */
  await limpiarSubidasAbandonadas().catch(() => {});

  const videos = listarVideos().map((v) => ({
    ...v,
    /* El porcentaje solo tiene sentido mientras se está convirtiendo. */
    progreso: v.estado === 'convirtiendo' ? progresoDe(v.slug) : null,
  }));

  return json({
    videos,
    cajon: {
      usados: videos.length,
      maximo: CONFIG.maxVideos,
      bytes: pesoDelCajon(),
    },
    volumen: estadoDelVolumen(),
  });
};
