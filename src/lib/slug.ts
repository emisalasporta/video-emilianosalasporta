/* ============================================================
   EL CÓDIGO DEL LINK
   El pedacito final de la dirección: /v/k7m2xp9qw4
   Tiene que ser IMPOSIBLE de adivinar. Nada de numerar los videos
   1, 2, 3: con eso cualquiera prueba /v/1 y ve lo que subiste.
   ============================================================ */

import { randomBytes } from 'node:crypto';

/* Alfabeto sin las letras y números que se confunden al leer o al dictar por
   teléfono: la i, la l, la o, el cero y el uno. Quedan 31 caracteres. */
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789';

/* Con 12 caracteres de 31 opciones hay 787 mil billones de combinaciones.
   Probando mil por segundo, encontrar UNO tardaría más que la edad del universo. */
const LARGO = 12;

/**
 * Devuelve un código al azar, imposible de predecir.
 *
 * Usa el generador criptográfico del sistema (`randomBytes`), no `Math.random()`:
 * el segundo es predecible si alguien ve unos cuantos resultados seguidos.
 */
export function nuevoSlug(largo: number = LARGO): string {
  /* Descartamos los bytes que caen en la "cola" incompleta del rango.
     Sin esto, los primeros caracteres del alfabeto saldrían un poco más seguido
     que los últimos (256 no es múltiplo de 31), y un sesgo así es justamente
     por donde se empieza a adivinar. */
  const tope = 256 - (256 % ALFABETO.length);
  let salida = '';

  while (salida.length < largo) {
    for (const byte of randomBytes(largo * 2)) {
      if (byte >= tope) continue;
      salida += ALFABETO[byte % ALFABETO.length];
      if (salida.length === largo) break;
    }
  }

  return salida;
}

/**
 * ¿Este texto tiene forma de código nuestro?
 *
 * Se usa antes de tocar el disco: si alguien pide /v/../../etc/passwd, la
 * respuesta es que no y no se lee ningún archivo. Es la defensa contra que
 * alguien arme una ruta hacia otra parte del servidor.
 */
export function slugValido(texto: unknown): texto is string {
  return typeof texto === 'string'
    && texto.length >= 8
    && texto.length <= 32
    && [...texto].every((c) => ALFABETO.includes(c));
}
