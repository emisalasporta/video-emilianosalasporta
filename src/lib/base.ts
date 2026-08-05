/* ============================================================
   LA BASE DE DATOS
   Guarda el título, el código del link, el estado y la fecha de
   cada video. Los archivos de video NO viven acá: viven al lado,
   en la carpeta videos/. Esto es apenas el índice.

   Usa el SQLite que viene adentro de Node (node:sqlite), así que
   no hay que instalar ninguna librería extra ni compilar nada.
   Un archivo suelto, base.db, dentro del volumen persistente.
   ============================================================ */

import { DatabaseSync } from 'node:sqlite';
import { CONFIG, prepararCarpetas } from './config';

export type Estado = 'subiendo' | 'convirtiendo' | 'listo' | 'error';

export interface Video {
  slug: string;
  titulo: string;
  estado: Estado;
  /** Qué salió mal, si el estado es 'error'. */
  detalle: string | null;
  /** Peso del MP4 final, en bytes. */
  bytes: number;
  /** Duración en segundos. */
  segundos: number;
  /** Cuándo se subió (milisegundos desde 1970). */
  creado: number;
}

let db: DatabaseSync | null = null;

/**
 * Abre la base (y la crea si es la primera vez).
 *
 * La tabla se crea sola con `IF NOT EXISTS`. No es un descuido: el día que se
 * monte un volumen vacío, o que alguien borre base.db por error, la plataforma
 * tiene que volver a arrancar sola en vez de tirar un error en cada pantalla.
 */
export function abrirBase(): DatabaseSync {
  if (db) return db;

  prepararCarpetas();
  db = new DatabaseSync(CONFIG.base);

  /* WAL hace que leer y escribir a la vez no se peleen. Sin esto, mientras se
     guarda un video la pantalla del listado se puede quedar esperando. */
  db.exec('PRAGMA journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS videos (
      slug     TEXT PRIMARY KEY,
      titulo   TEXT NOT NULL,
      estado   TEXT NOT NULL,
      detalle  TEXT,
      bytes    INTEGER NOT NULL DEFAULT 0,
      segundos REAL NOT NULL DEFAULT 0,
      creado   INTEGER NOT NULL
    )
  `);

  /* Si el contenedor se reinició justo mientras se subía o se convertía algo,
     quedan filas colgadas en un estado que ya nunca va a avanzar (la cola de
     conversión vive en memoria y se perdió con el reinicio). Las marcamos como
     error apenas arrancamos, así el panel muestra la verdad en vez de un
     "convirtiendo..." eterno que nunca termina. */
  db.exec(`
    UPDATE videos
       SET estado = 'error',
           detalle = 'El servidor se reinició antes de terminar. Volvé a subir el video.'
     WHERE estado IN ('subiendo', 'convirtiendo')
  `);

  return db;
}

export function crearVideo(slug: string, titulo: string): void {
  abrirBase()
    .prepare('INSERT INTO videos (slug, titulo, estado, creado) VALUES (?, ?, ?, ?)')
    .run(slug, titulo, 'subiendo', Date.now());
}

export function marcarEstado(slug: string, estado: Estado, detalle: string | null = null): void {
  abrirBase()
    .prepare('UPDATE videos SET estado = ?, detalle = ? WHERE slug = ?')
    .run(estado, detalle, slug);
}

export function marcarListo(slug: string, bytes: number, segundos: number): void {
  abrirBase()
    .prepare("UPDATE videos SET estado = 'listo', detalle = NULL, bytes = ?, segundos = ? WHERE slug = ?")
    .run(bytes, segundos, slug);
}

export function buscarVideo(slug: string): Video | null {
  const fila = abrirBase().prepare('SELECT * FROM videos WHERE slug = ?').get(slug);
  return (fila as Video | undefined) ?? null;
}

/** Todos los videos, del más nuevo al más viejo. */
export function listarVideos(): Video[] {
  return abrirBase().prepare('SELECT * FROM videos ORDER BY creado DESC').all() as unknown as Video[];
}

export function borrarFila(slug: string): void {
  abrirBase().prepare('DELETE FROM videos WHERE slug = ?').run(slug);
}

/**
 * Los videos que sobran del cajón, del más viejo primero.
 *
 * Se cuentan TODOS (incluidos los que fallaron), porque el archivo original
 * de un video con error también ocupa lugar en el disco.
 */
export function videosQueSobran(maximo: number): Video[] {
  const todos = listarVideos();
  return todos.slice(maximo).reverse();
}
