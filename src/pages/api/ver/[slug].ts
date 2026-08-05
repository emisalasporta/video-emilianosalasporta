/* ============================================================
   SERVIR EL VIDEO
   Este endpoint es el que hace que se pueda ADELANTAR sin bajar
   todo el archivo antes.

   Cómo funciona: cuando arrastrás la barra al minuto 4, el navegador
   no pide "el video", pide "los bytes del 12.000.000 al 13.000.000".
   Eso se llama un pedido por rango (Range). El servidor contesta con
   un 206 ("acá va el pedazo que pediste") y manda solo esa porción.

   Sin esto el video igual se ve, pero al querer adelantar el navegador
   tiene que descargar todo desde el principio, y con archivos grandes
   se siente colgado.
   ============================================================ */

import type { APIRoute } from 'astro';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { CONFIG } from '../../../lib/config';
import { buscarVideo } from '../../../lib/base';
import { slugValido } from '../../../lib/slug';

export const prerender = false;

interface Encontrado {
  ruta: string;
  tamano: number;
}

async function ubicar(slug: string | undefined): Promise<Encontrado | null> {
  /* Se valida la forma del código ANTES de armar la ruta. Sin esto, alguien
     podría pedir /api/ver/..%2F..%2Fetc%2Fpasswd y hacernos leer un archivo
     de cualquier parte del servidor. */
  if (!slugValido(slug)) return null;

  const video = buscarVideo(slug);
  if (!video || video.estado !== 'listo') return null;

  const ruta = path.join(CONFIG.videos, `${slug}.mp4`);
  try {
    return { ruta, tamano: (await stat(ruta)).size };
  } catch {
    return null;
  }
}

/**
 * Interpreta el encabezado Range.
 *
 * Acepta las tres formas del estándar: "bytes=100-200" (un tramo),
 * "bytes=100-" (de ahí al final) y "bytes=-500" (los últimos 500).
 *
 * Devuelve:
 *  - `null` si no vino ningún pedido de rango
 *  - `'ignorar'` si vino pero no lo entendemos
 *  - `'fuera'` si se entiende pero pide más allá del final del archivo
 *  - el tramo, si está todo bien
 *
 * La diferencia entre 'ignorar' y 'fuera' importa y la fija el estándar (RFC
 * 9110): un Range que no se entiende **se ignora** y se manda el archivo
 * entero, y el error 416 se reserva para un rango bien escrito pero imposible.
 * Contestar 416 a lo que no entendemos rompería a cualquier cliente que pida
 * dos tramos a la vez (cosa válida que acá no hacemos), o a un antivirus
 * corporativo que reescriba la cabecera: verían un error en vez del video.
 */
function interpretarRango(
  cabecera: string | null,
  tamano: number,
): { desde: number; hasta: number } | null | 'ignorar' | 'fuera' {
  if (!cabecera) return null;

  const coincide = /^bytes=(\d*)-(\d*)$/.exec(cabecera.trim());
  if (!coincide) return 'ignorar';

  const [, textoDesde, textoHasta] = coincide;

  /* "bytes=-" a secas no dice nada. */
  if (textoDesde === '' && textoHasta === '') return 'ignorar';

  let desde: number;
  let hasta: number;

  if (textoDesde === '') {
    /* "bytes=-500": los últimos 500 bytes. */
    const ultimos = Number(textoHasta);
    if (!Number.isFinite(ultimos)) return 'ignorar';
    if (ultimos <= 0) return 'fuera';
    desde = Math.max(0, tamano - ultimos);
    hasta = tamano - 1;
  } else {
    desde = Number(textoDesde);
    if (!Number.isFinite(desde)) return 'ignorar';

    if (textoHasta === '') {
      /* "bytes=100-": de ahí al final. */
      hasta = tamano - 1;
    } else {
      hasta = Number(textoHasta);
      if (!Number.isFinite(hasta)) return 'ignorar';
      /* Un tramo dado vuelta ("del 900 al 100") está mal escrito: se ignora.
         Este control va acá adentro y no afuera: con "bytes=2500-" el final se
         calcula como el fin del archivo, así que afuera parecería un tramo al
         revés cuando en realidad es un pedido fuera de rango, que lleva 416. */
      if (hasta < desde) return 'ignorar';
    }
  }

  if (desde >= tamano) return 'fuera';

  /* Si piden más allá del final, se recorta en vez de fallar: es lo que hacen
     los servidores de verdad y algunos reproductores lo aprovechan. */
  return { desde, hasta: Math.min(hasta, tamano - 1) };
}

function cabeceras(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'content-type': 'video/mp4',
    /* Avisa al navegador que este archivo acepta pedidos por tramo. Sin este
       encabezado, muchos reproductores ni se molestan en intentar adelantar. */
    'accept-ranges': 'bytes',
    /* Se puede cachear con ganas: un código de link nunca cambia de contenido.
       Si borrás el video, el link deja de existir.

       Va `private` y no `public` a propósito: significa "guardalo en el
       navegador de quien lo vio, pero no en ninguna caché compartida del
       camino". El link vale porque es secreto, y no queremos que el día que
       alguien active el proxy de Cloudflare los videos queden guardados en una
       CDN ajena. Para el que lo mira no cambia nada. */
    'cache-control': 'private, max-age=31536000, immutable',
    ...extra,
  };
}

export const GET: APIRoute = async ({ params, request }) => {
  const archivo = await ubicar(params.slug);
  if (!archivo) return new Response('No existe', { status: 404 });

  const rango = interpretarRango(request.headers.get('range'), archivo.tamano);

  if (rango === 'fuera') {
    return new Response('Rango fuera del archivo', {
      status: 416,
      headers: { 'content-range': `bytes */${archivo.tamano}` },
    });
  }

  /* Sin pedido de rango, o con uno que no entendemos: el archivo entero. */
  if (rango === null || rango === 'ignorar') {
    const flujo = createReadStream(archivo.ruta);
    return new Response(Readable.toWeb(flujo) as ReadableStream, {
      status: 200,
      headers: cabeceras({ 'content-length': String(archivo.tamano) }),
    });
  }

  /* Con pedido de rango: solo ese tramo, y con el 206 que lo anuncia.
     Ojo con el `end` de createReadStream: es INCLUSIVO, igual que en el
     estándar HTTP. Restarle uno acá dejaría el video con micro-cortes
     dificilísimos de diagnosticar. */
  const flujo = createReadStream(archivo.ruta, { start: rango.desde, end: rango.hasta });

  return new Response(Readable.toWeb(flujo) as ReadableStream, {
    status: 206,
    headers: cabeceras({
      'content-range': `bytes ${rango.desde}-${rango.hasta}/${archivo.tamano}`,
      'content-length': String(rango.hasta - rango.desde + 1),
    }),
  });
};

/* Algunos reproductores preguntan primero con HEAD (cuánto pesa, acepta
   rangos) antes de pedir nada. Si eso devuelve 404, ni intentan reproducir. */
export const HEAD: APIRoute = async ({ params }) => {
  const archivo = await ubicar(params.slug);
  if (!archivo) return new Response(null, { status: 404 });

  return new Response(null, {
    status: 200,
    headers: cabeceras({ 'content-length': String(archivo.tamano) }),
  });
};
