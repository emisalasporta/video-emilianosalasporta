/* ============================================================
   LA CONTRASEÑA
   Una sola, la tuya, que viaja en una variable de entorno de
   Dokploy. No hay usuarios, no hay registro, no hay "olvidé mi
   contraseña": si la querés cambiar, la cambiás en Dokploy y
   redeployás.
   ============================================================ */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { CONFIG } from './config';

const NOMBRE_COOKIE = 'sesion';

/** 30 días. Después de eso, el panel vuelve a pedir la contraseña. */
const DURACION_SEGUNDOS = 60 * 60 * 24 * 30;

/**
 * ¿La contraseña que escribieron es la correcta?
 *
 * La comparación es en tiempo constante (`timingSafeEqual`) en vez del `===` de
 * toda la vida. El `===` corta apenas encuentra una letra distinta, y esa
 * diferencia de microsegundos, medida muchas veces, deja adivinar la clave letra
 * por letra. Es un ataque real y viejo, y evitarlo cuesta estas cuatro líneas.
 */
export function claveCorrecta(intento: unknown): boolean {
  if (typeof intento !== 'string' || !CONFIG.clave) return false;

  /* Los dos lados tienen que medir lo mismo para poder compararlos, así que en
     vez de comparar los textos comparamos sus huellas, que siempre miden 32 bytes. */
  const a = createHmac('sha256', 'comparacion').update(intento).digest();
  const b = createHmac('sha256', 'comparacion').update(CONFIG.clave).digest();
  return timingSafeEqual(a, b);
}

/**
 * El contenido de la cookie de sesión.
 *
 * NO es la contraseña: es una huella derivada de ella. Si alguien llegara a ver
 * la cookie, no se lleva la clave. Y como la huella se calcula con la clave, el
 * día que la cambies todas las sesiones abiertas dejan de valer solas.
 */
function huella(): string {
  return createHmac('sha256', CONFIG.clave).update('panel-de-video').digest('hex');
}

/** ¿Esta petición viene de alguien que ya puso la contraseña? */
export function haySesion(request: Request): boolean {
  if (!CONFIG.clave) return false;

  const cookies = request.headers.get('cookie') ?? '';
  const encontrada = cookies
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${NOMBRE_COOKIE}=`));

  if (!encontrada) return false;

  const valor = Buffer.from(encontrada.slice(NOMBRE_COOKIE.length + 1));
  const esperado = Buffer.from(huella());
  return valor.length === esperado.length && timingSafeEqual(valor, esperado);
}

/** La línea `Set-Cookie` que abre la sesión. */
export function cookieDeEntrada(seguro: boolean): string {
  const partes = [
    `${NOMBRE_COOKIE}=${huella()}`,
    'Path=/',
    /* HttpOnly: el JavaScript de la página no puede leer esta cookie.
       SameSite=Strict: no se manda si el pedido viene desde otro sitio, así
       nadie puede armar una página que le haga borrar tus videos sin querer. */
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${DURACION_SEGUNDOS}`,
  ];
  /* Secure solo cuando hay HTTPS de verdad. En tu compu (http://localhost) el
     navegador descartaría una cookie marcada como Secure y no podrías entrar. */
  if (seguro) partes.push('Secure');
  return partes.join('; ');
}

/** La línea `Set-Cookie` que cierra la sesión. */
export function cookieDeSalida(): string {
  return `${NOMBRE_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

/** Respuesta corta para cuando alguien golpea un endpoint del panel sin sesión. */
export function sinPermiso(): Response {
  return new Response(JSON.stringify({ error: 'Hace falta entrar con la contraseña.' }), {
    status: 401,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
