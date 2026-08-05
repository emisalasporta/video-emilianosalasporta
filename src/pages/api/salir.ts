/* Cierra la sesión: borra la cookie y listo. */

import type { APIRoute } from 'astro';
import { cookieDeSalida } from '../../lib/clave';
import { json } from '../../lib/respuestas';

export const prerender = false;

export const POST: APIRoute = async () => json({ ok: true }, 200, { 'set-cookie': cookieDeSalida() });
