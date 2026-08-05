/* Recibe la contraseña y, si está bien, deja la cookie de sesión. */

import type { APIRoute } from 'astro';
import { claveCorrecta, cookieDeEntrada } from '../../lib/clave';
import { CONFIG } from '../../lib/config';
import { json, error, leerJson } from '../../lib/respuestas';

export const prerender = false;

/* Un freno simple contra el que se ponga a probar contraseñas: después de 8
   intentos fallidos, hay que esperar 15 minutos. */
const intentos = new Map<string, { fallos: number; hasta: number }>();
const TOPE_FALLOS = 8;
const ESPERA_MINUTOS = 15;

/**
 * De qué dirección de internet viene el que golpea la puerta.
 *
 * Hay que mirar `x-forwarded-for` y no la conexión directa. Detrás de Traefik
 * TODAS las visitas llegan desde la misma dirección (la del propio Traefik), así
 * que contar por conexión directa mete a todo internet en la misma bolsa: un
 * robot probando contraseñas dejaría a Emiliano afuera de su propio panel.
 *
 * Confiar en esa cabecera es seguro acá porque el puerto del contenedor no está
 * publicado: no se puede llegar sin pasar por Traefik, que la reescribe siempre.
 */
function deDondeViene(request: Request, directa: string | undefined): string {
  const cadena = request.headers.get('x-forwarded-for');
  if (cadena) {
    const primera = cadena.split(',')[0]?.trim();
    if (primera) return primera;
  }
  return directa ?? 'desconocido';
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!CONFIG.clave) {
    return error('El servidor no tiene contraseña cargada. Falta la variable CLAVE_ADMIN en Dokploy.', 500);
  }

  const quien = deDondeViene(request, clientAddress);
  let registro = intentos.get(quien);

  /* Si ya pasó la espera, se borra el registro y se empieza de cero. Sin esto,
     una vez cruzado el tope quedaba trabado para siempre: cada tecleo
     equivocado volvía a sumar 15 minutos, aunque hubieran pasado semanas. */
  if (registro && Date.now() >= registro.hasta) {
    intentos.delete(quien);
    registro = undefined;
  }

  if (registro && registro.fallos >= TOPE_FALLOS) {
    const minutos = Math.ceil((registro.hasta - Date.now()) / 60000);
    return error(`Demasiados intentos. Probá de nuevo en ${minutos} minutos.`, 429);
  }

  const { clave } = await leerJson(request);

  if (!claveCorrecta(clave)) {
    const fallos = (registro?.fallos ?? 0) + 1;
    intentos.set(quien, { fallos, hasta: Date.now() + ESPERA_MINUTOS * 60 * 1000 });
    return error('Contraseña incorrecta.', 401);
  }

  intentos.delete(quien);

  /* Solo marcamos la cookie como Secure si la petición vino por HTTPS. En tu
     compu, por http://localhost, una cookie Secure la descarta el navegador. */
  const seguro = new URL(request.url).protocol === 'https:'
    || request.headers.get('x-forwarded-proto') === 'https';

  return json({ ok: true }, 200, { 'set-cookie': cookieDeEntrada(seguro) });
};
