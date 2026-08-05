/* ============================================================
   CONFIGURACIÓN
   Todo lo que se puede cambiar sin tocar código vive acá, y sale
   de las variables de entorno que se cargan en Dokploy.
   ============================================================ */

import { mkdirSync } from 'node:fs';
import path from 'node:path';

/** Lee un número de las variables de entorno; si no está o es basura, usa el valor por defecto. */
function numero(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

/* La carpeta de datos es LA decisión importante de todo el proyecto.
   Apunta al volumen persistente que monta Dokploy. Todo lo que viva
   adentro sobrevive a los redeploys; todo lo que viva afuera se borra
   cada vez que se reconstruye el contenedor. */
const CARPETA = process.env.CARPETA_DATOS ?? path.resolve('./datos');

export const CONFIG = {
  /** La contraseña para entrar a /admin. Sin esto cargado, el panel no deja pasar a nadie. */
  clave: process.env.CLAVE_ADMIN ?? '',

  /** Raíz del volumen persistente. */
  carpeta: CARPETA,

  /** Los MP4 ya convertidos, listos para servir. */
  videos: path.join(CARPETA, 'videos'),

  /** Los archivos originales mientras se suben y se convierten. Se vacía sola. */
  trabajo: path.join(CARPETA, 'trabajo'),

  /** La base con los títulos, los códigos de link y el estado de cada video. */
  base: path.join(CARPETA, 'base.db'),

  /** Tamaño máximo de un archivo, en MB. */
  maxMB: numero(process.env.MAX_MB, 2048),

  /* Cuántos videos guarda el cajón. Al subir uno nuevo, si se pasa de este
     número, se borra el más viejo. Es el freno que impide que esto crezca
     hasta llenar el disco del servidor y tumbar todo lo demás. */
  maxVideos: numero(process.env.MAX_VIDEOS, 5),

  /* Cuántos núcleos puede usar ffmpeg. Con 1 la conversión tarda más pero el
     servidor sigue respondiendo normal mientras tanto. Importa porque este VPS
     lo comparten la web y el sistema de la DPRD. */
  hilos: numero(process.env.FFMPEG_HILOS, 1),

  /* Calidad de la conversión. Más bajo = más nítido y más pesado.
     18 es "visualmente igual al original" y es lo que queremos para capturas
     de pantalla, donde lo que importa es que el texto chico se lea. */
  calidad: numero(process.env.FFMPEG_CALIDAD, 18),

  /* Cómo se llaman los dos programas de conversión. En el servidor están
     instalados en el contenedor y se los encuentra por el nombre a secas, así
     que no hay que tocar nada. Se pueden apuntar a una ruta completa por si
     alguna vez hay que probar en una máquina donde no están en el PATH. */
  ffmpeg: process.env.FFMPEG_RUTA || 'ffmpeg',
  ffprobe: process.env.FFPROBE_RUTA || 'ffprobe',
} as const;

/** Tamaño máximo en bytes (derivado, para no repetir la cuenta por ahí). */
export const MAX_BYTES = CONFIG.maxMB * 1024 * 1024;

/* Los pedazos en los que el navegador parte el archivo para subirlo.
   4 MB tarda pocos segundos en viajar, así que nunca llega a chocar contra el
   límite de un minuto que tiene el repartidor de tráfico del servidor.
   Esa es toda la razón de ser de este número: gracias a él no hay que tocar
   ninguna configuración compartida con la web ni con la DPRD. */
export const PEDAZO_BYTES = 4 * 1024 * 1024;

/** Crea las carpetas del volumen si no existen. Se llama una vez, al arrancar. */
export function prepararCarpetas(): void {
  mkdirSync(CONFIG.videos, { recursive: true });
  mkdirSync(CONFIG.trabajo, { recursive: true });
}
