/* Recibe UN pedazo del archivo y lo escribe en su lugar.

   Acá está la razón de que toda la subida funcione sin tocar nada del
   servidor: cada pedazo son 4 MB, que viajan en pocos segundos. El
   repartidor de tráfico del VPS corta cualquier envío que tarde más de
   un minuto, y de esta forma nunca nos acercamos a ese límite, ni con
   un archivo de 2 GB. */

import type { APIRoute } from 'astro';
import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import { haySesion, sinPermiso } from '../../../lib/clave';
import { CONFIG, MAX_BYTES } from '../../../lib/config';
import { buscarVideo } from '../../../lib/base';
import { slugValido } from '../../../lib/slug';
import { json, error } from '../../../lib/respuestas';

export const prerender = false;

/* Un pedido a la vez por cada video.

   Sin esto hay una carrera real: dos pedidos del mismo pedazo pueden mirar el
   tamaño del archivo al mismo tiempo, los dos ven lo mismo, y los dos escriben.
   El archivo queda con bytes repetidos en el medio y el video sale cortado, sin
   ningún error que avise. Pasa de verdad cuando el navegador reintenta un
   pedazo que en realidad todavía estaba viajando. */
const enCurso = new Map<string, Promise<void>>();

function enFila<T>(slug: string, tarea: () => Promise<T>): Promise<T> {
  const anterior = enCurso.get(slug) ?? Promise.resolve();

  /* El segundo argumento del then hace que la tarea corra igual si la anterior
     falló: un pedazo rechazado no tiene por qué trabar los que vienen atrás. */
  const propia = anterior.then(tarea, tarea);

  /* En el Map guardamos una versión que nunca falla, para poder encadenar. */
  const silenciosa = propia.then(() => {}, () => {});
  enCurso.set(slug, silenciosa);

  void silenciosa.then(() => {
    /* El último de la fila apaga la luz, así el Map no se llena con un slug por
       cada video que se haya subido en la vida. */
    if (enCurso.get(slug) === silenciosa) enCurso.delete(slug);
  });

  return propia;
}

export const POST: APIRoute = async ({ request, url }) => {
  if (!haySesion(request)) return sinPermiso();

  const slug = url.searchParams.get('slug') ?? '';
  const desde = Number(url.searchParams.get('desde') ?? -1);

  if (!slugValido(slug)) return error('Código de video inválido.');
  if (!Number.isInteger(desde) || desde < 0) return error('Posición inválida.');

  const video = buscarVideo(slug);
  if (!video) return error('Ese video no existe.', 404);
  if (video.estado !== 'subiendo') return error('Esa subida ya se cerró.', 409);

  /* Se mira el tamaño declarado ANTES de leer el cuerpo. Si no, un pedido de
     500 MB se cargaría entero en memoria solo para después rechazarlo, y con el
     contenedor limitado a 1 GB eso lo mata. */
  const declarado = Number(request.headers.get('content-length') ?? 0);
  if (declarado > MAX_BYTES || desde + declarado > MAX_BYTES) {
    return error(`El archivo se pasa de los ${CONFIG.maxMB} MB permitidos.`, 413);
  }

  const datos = Buffer.from(await request.arrayBuffer());
  if (datos.length === 0) return error('Llegó un pedazo vacío.');

  const archivo = path.join(CONFIG.trabajo, `${slug}.origen`);

  return enFila(slug, async () => {
    let actual: number;
    try {
      actual = (await stat(archivo)).size;
    } catch {
      return error('Se perdió el archivo a medio subir. Empezá de nuevo.', 410);
    }

    /* Un pedazo que empieza MÁS ADELANTE de donde terminó el archivo dejaría un
       agujero de bytes vacíos en el medio. Eso sí se rechaza, y se avisa por
       dónde iba la cosa para que el navegador pueda retomar desde ahí. */
    if (desde > actual) {
      return json({ error: 'Los pedazos llegaron desordenados.', esperaba: actual }, 409);
    }

    if (actual + datos.length > MAX_BYTES) {
      return error(`El archivo se pasó de los ${CONFIG.maxMB} MB permitidos.`, 413);
    }

    /* Se escribe en la POSICIÓN indicada en vez de pegar al final.
       La diferencia importa: si el navegador reintenta un pedazo que el
       servidor ya había recibido (porque se cortó la conexión justo al
       contestar), escribir en la posición vuelve a poner los mismos bytes en el
       mismo lugar y no pasa nada. Pegando al final, en cambio, quedaban
       duplicados y el video salía cortado. */
    const puntero = await open(archivo, 'r+');
    try {
      await puntero.write(datos, 0, datos.length, desde);
    } finally {
      await puntero.close();
    }

    return json({ recibido: Math.max(actual, desde + datos.length) });
  });
};
