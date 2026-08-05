/* ============================================================
   LA MARCA DEL VOLUMEN
   Sirve para contestar de un vistazo la pregunta más importante
   de toda la instalación: ¿los videos se están guardando en el
   volumen persistente, o adentro del contenedor?

   Si están adentro del contenedor, todo parece funcionar de
   maravilla... hasta el primer redeploy, cuando desaparece todo
   sin aviso. Es el error clásico y es silencioso.

   Cómo se responde: la primera vez que arranca, la plataforma deja
   un archivito con la fecha. Si el volumen está bien montado, esa
   fecha SOBREVIVE a los redeploys y siempre se ve la misma. Si no
   lo está, cada redeploy la reinicia y se ve la fecha de hoy.

   O sea: redeployá y mirá si la fecha cambió. Si cambió, el volumen
   no está montado.
   ============================================================ */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG, prepararCarpetas } from './config';

const ARCHIVO = () => path.join(CONFIG.carpeta, 'primer-arranque.txt');

/**
 * Devuelve cuándo se usó por primera vez esta carpeta de datos.
 * La crea si es la primera vez.
 */
export function primerArranque(): number {
  prepararCarpetas();
  const archivo = ARCHIVO();

  try {
    if (existsSync(archivo)) {
      const guardado = Number(readFileSync(archivo, 'utf8').trim());
      if (Number.isFinite(guardado) && guardado > 0) return guardado;
    }
    const ahora = Date.now();
    writeFileSync(archivo, String(ahora), 'utf8');
    return ahora;
  } catch {
    /* Si ni siquiera se puede escribir, algo está muy mal con los permisos del
       volumen. Devolvemos 0 y el panel lo muestra como "no se pudo verificar". */
    return 0;
  }
}

/** Datos del volumen para mostrar en el panel. */
export function estadoDelVolumen(): { carpeta: string; desde: number } {
  return { carpeta: CONFIG.carpeta, desde: primerArranque() };
}
