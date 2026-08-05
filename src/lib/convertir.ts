/* ============================================================
   LA CONVERSIÓN
   Agarra el archivo original (.wmv, .mov, .avi, lo que sea) y lo
   deja como un MP4 que cualquier navegador puede reproducir.

   Dos cuidados que mandan sobre todo lo demás:

   1. NITIDEZ. Son capturas de pantalla con texto chico. Se comprime
      con calidad alta y NO se reduce la resolución: sale del mismo
      tamaño que entró.

   2. NO AHOGAR EL SERVIDOR. Este VPS también tiene la web y el
      sistema de la DPRD. Se convierte de a UN video por vez y con
      los núcleos contados. Tarda un poco más y no se nota desde
      afuera, que es exactamente lo que queremos.
   ============================================================ */

import { spawn } from 'node:child_process';
import { rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from './config';
import { marcarEstado, marcarListo, listarVideos, borrarFila, buscarVideo, videosQueSobran } from './base';

/* ------------------------------------------------------------------
   Progreso, para que el panel pueda mostrar algo mientras se espera
   ------------------------------------------------------------------ */

/** slug -> porcentaje convertido (0 a 100). Vive en memoria y se pierde al reiniciar; no importa. */
const progreso = new Map<string, number>();

export function progresoDe(slug: string): number {
  return progreso.get(slug) ?? 0;
}

/* ------------------------------------------------------------------
   La cola: de a uno por vez
   ------------------------------------------------------------------ */

const cola: Array<{ slug: string; origen: string }> = [];
let trabajando = false;

/**
 * Mete un video en la fila y devuelve el control enseguida.
 *
 * Es a propósito que esto NO se espere: la petición HTTP del navegador tiene
 * que terminar en el momento. Convertir tarda minutos, y si la respuesta
 * quedara esperando, el navegador (y el repartidor de tráfico del servidor)
 * cortarían la conexión mucho antes de que ffmpeg termine.
 */
export function encolar(slug: string, origen: string): void {
  cola.push({ slug, origen });
  /* El catch no es decorativo: sin él, un error inesperado acá arriba (por
     ejemplo la base trabada) queda como promesa rechazada sin atender, y eso en
     Node MATA el proceso entero. Se caería el contenedor y con él cualquier
     subida en curso. */
  void atenderCola().catch((error) => {
    console.error('[conversión] la cola se cayó:', error);
  });
}

async function atenderCola(): Promise<void> {
  if (trabajando) return;
  trabajando = true;

  try {
    let tarea = cola.shift();
    while (tarea) {
      await procesar(tarea.slug, tarea.origen);
      tarea = cola.shift();
    }
  } finally {
    trabajando = false;
  }
}

/* ------------------------------------------------------------------
   Mirar el archivo antes de tocarlo
   ------------------------------------------------------------------ */

interface Ficha {
  segundos: number;
  ancho: number;
  alto: number;
  codecVideo: string;
  codecAudio: string | null;
  contenedor: string;
}

/** Le pregunta a ffprobe qué hay adentro del archivo. */
async function inspeccionar(archivo: string): Promise<Ficha> {
  const salida = await correr(CONFIG.ffprobe, [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    archivo,
  ]);

  const datos = JSON.parse(salida.stdout);
  const streams: any[] = datos.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video');
  const audio = streams.find((s) => s.codec_type === 'audio');

  if (!video) throw new Error('El archivo no tiene imagen. ¿Seguro que es un video?');

  /* Ojo con la duración: ffprobe a veces devuelve "N/A" en vez de un número.
     Si eso llegara crudo hasta la base, la escritura falla y el video se marca
     como error y se borra... habiéndose convertido perfecto. Un cero solo hace
     que no se pueda mostrar el porcentaje de avance, que es mucho menos grave. */
  const duracion = Number(datos.format?.duration);

  return {
    segundos: Number.isFinite(duracion) && duracion > 0 ? duracion : 0,
    ancho: Number(video.width ?? 0),
    alto: Number(video.height ?? 0),
    codecVideo: String(video.codec_name ?? ''),
    codecAudio: audio ? String(audio.codec_name ?? '') : null,
    contenedor: String(datos.format?.format_name ?? ''),
  };
}

/**
 * ¿Este archivo ya está listo para el navegador tal como vino?
 *
 * Si un video ya es MP4 con H.264 y AAC, recomprimirlo sería perder nitidez a
 * cambio de nada. En ese caso solo se reordena por dentro (que es instantáneo)
 * y queda igual de nítido que el original.
 */
function yaSirve(ficha: Ficha): boolean {
  const contenedorOk = ficha.contenedor.includes('mp4') || ficha.contenedor.includes('mov');
  const videoOk = ficha.codecVideo === 'h264';
  const audioOk = ficha.codecAudio === null || ficha.codecAudio === 'aac';
  return contenedorOk && videoOk && audioOk;
}

/* ------------------------------------------------------------------
   El trabajo en sí
   ------------------------------------------------------------------ */

async function procesar(slug: string, origen: string): Promise<void> {
  const destino = path.join(CONFIG.videos, `${slug}.mp4`);

  try {
    progreso.set(slug, 0);
    const ficha = await inspeccionar(origen);

    const argumentos = yaSirve(ficha)
      ? argumentosCopia(origen, destino)
      : argumentosConversion(origen, destino, ficha);

    await correr(CONFIG.ffmpeg, argumentos, (segundosHechos) => {
      if (ficha.segundos > 0) {
        progreso.set(slug, Math.min(99, Math.round((segundosHechos / ficha.segundos) * 100)));
      }
    });

    /* ¿El video sigue existiendo? Puede haberse borrado desde el panel, o
       haberlo sacado el tope del cajón, mientras ffmpeg trabajaba.

       Sin este control quedaba un MP4 en el disco que NO figura en la base:
       no lo lista nadie, no lo cuenta el medidor y el borrado automático nunca
       lo encuentra, porque recorre la base. O sea, disco ocupado para siempre
       por un archivo invisible. Es justo la forma de llenar el disco del VPS en
       silencio que todo esto trata de evitar. */
    if (!buscarVideo(slug)) {
      await rm(destino, { force: true }).catch(() => {});
      return;
    }

    const info = await stat(destino);
    marcarListo(slug, info.size, ficha.segundos);
    progreso.set(slug, 100);
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    marcarEstado(slug, 'error', mensaje.slice(0, 500));
    /* Si algo falló, el MP4 a medio escribir no sirve para nada y ocupa lugar. */
    await rm(destino, { force: true }).catch(() => {});
  } finally {
    /* El original se borra SIEMPRE, salga bien o mal. Ya cumplió su función y
       es el archivo más pesado de los dos. */
    await rm(origen, { force: true }).catch(() => {});
    progreso.delete(slug);
    await limpiarViejos();
  }
}

/** Los argumentos para cuando el archivo ya venía bien y solo hay que reordenarlo. */
function argumentosCopia(origen: string, destino: string): string[] {
  return [
    '-y',
    '-i', origen,
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-c', 'copy',
    /* faststart mueve el índice del video al principio del archivo. Sin esto el
       navegador tiene que bajar el archivo entero antes de mostrar el primer
       cuadro, y adelantar no funciona. */
    '-movflags', '+faststart',
    '-progress', 'pipe:1',
    '-nostats',
    destino,
  ];
}

/** Los argumentos para convertir de verdad. */
function argumentosConversion(origen: string, destino: string, ficha: Ficha): string[] {
  const args = [
    '-y',
    '-i', origen,
    /* Tomamos la primera pista de imagen y, si existe, la primera de audio.
       El signo de pregunta hace que el audio sea opcional: una captura de
       pantalla muda se convierte igual en vez de fallar. */
    '-map', '0:v:0',
    '-map', '0:a:0?',

    '-c:v', 'libx264',
    /* El preset es cuánto se esfuerza el compresor. 'medium' da la MISMA nitidez
       que uno más lento (eso lo fija el -crf), solo que el archivo pesa un poco
       más. Cambiarlo por 'slow' duplicaría el tiempo de CPU en un servidor que
       está compartido, y ganaríamos unos pocos MB. No vale la pena. */
    '-preset', 'medium',
    '-crf', String(CONFIG.calidad),

    /* yuv420p es feo de explicar pero es obligatorio: es el único formato de
       color que reproducen TODOS los navegadores y celulares. Sin esto, el
       video anda en la compu y se ve negro en el iPhone de alguien. */
    '-pix_fmt', 'yuv420p',
    '-profile:v', 'high',
    '-level', '4.2',

    /* El freno de CPU. */
    '-threads', String(CONFIG.hilos),

    '-c:a', 'aac',
    '-b:a', '128k',
    '-ac', '2',

    '-movflags', '+faststart',
    '-progress', 'pipe:1',
    '-nostats',
  ];

  /* H.264 no admite anchos ni altos impares. Casi ninguna grabación los tiene,
     pero si aparece uno hay que emparejarlo o ffmpeg falla de una.
     Ojo: esto recorta UN píxel como mucho. NO es reducir la resolución, que es
     justamente lo que no queremos hacer con capturas llenas de texto. */
  if (ficha.ancho % 2 !== 0 || ficha.alto % 2 !== 0) {
    args.push('-vf', 'crop=trunc(iw/2)*2:trunc(ih/2)*2');
  }

  args.push(destino);
  return args;
}

/* ------------------------------------------------------------------
   Correr un programa y esperar a que termine
   ------------------------------------------------------------------ */

/** Tope de seguridad: si ffmpeg se cuelga, se lo mata en vez de dejarlo comiendo CPU para siempre. */
const TOPE_MINUTOS = 90;

function correr(
  programa: string,
  argumentos: string[],
  alAvanzar?: (segundos: number) => void,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolver, rechazar) => {
    const proceso = spawn(programa, argumentos, { windowsHide: true });

    let stdout = '';
    let stderr = '';

    const reloj = setTimeout(() => {
      proceso.kill('SIGKILL');
      rechazar(new Error(`La conversión tardó más de ${TOPE_MINUTOS} minutos y se canceló.`));
    }, TOPE_MINUTOS * 60 * 1000);

    proceso.stdout.on('data', (trozo: Buffer) => {
      const texto = trozo.toString();
      stdout += texto;

      /* Con -progress, ffmpeg escribe líneas tipo "out_time_ms=12345678".
         Es en microsegundos pese al nombre (un viejo error de ffmpeg que
         quedó por compatibilidad). */
      if (alAvanzar) {
        for (const linea of texto.split('\n')) {
          if (linea.startsWith('out_time_ms=')) {
            const micros = Number(linea.slice('out_time_ms='.length));
            if (Number.isFinite(micros)) alAvanzar(micros / 1_000_000);
          }
        }
      }
    });

    /* ffmpeg escribe TODO su informe por la salida de errores, incluso cuando
       sale bien. Nos quedamos solo con el final, que es donde dice qué pasó. */
    proceso.stderr.on('data', (trozo: Buffer) => {
      stderr = (stderr + trozo.toString()).slice(-4000);
    });

    proceso.on('error', (error) => {
      clearTimeout(reloj);
      rechazar(
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? new Error(`No se encontró ${programa}. Tiene que estar instalado en el servidor.`)
          : error,
      );
    });

    proceso.on('close', (codigo) => {
      clearTimeout(reloj);
      if (codigo === 0) {
        resolver({ stdout, stderr });
      } else {
        rechazar(new Error(ultimaLineaUtil(stderr) || `${programa} falló (código ${codigo}).`));
      }
    });
  });
}

/** Saca de la parrafada de ffmpeg la línea que de verdad explica el problema. */
function ultimaLineaUtil(stderr: string): string {
  const lineas = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('frame=') && !l.startsWith('size='));
  return lineas[lineas.length - 1] ?? '';
}

/* ------------------------------------------------------------------
   El tope del cajón
   ------------------------------------------------------------------ */

/**
 * Deja el cajón en el máximo configurado, borrando los más viejos.
 *
 * Este es EL freno que impide que la plataforma crezca hasta llenar el disco
 * del servidor. Si el disco se llena, no se cae solo esto: se cae la web y
 * todo lo demás que viva en el mismo VPS.
 */
export async function limpiarViejos(): Promise<void> {
  for (const viejo of videosQueSobran(CONFIG.maxVideos)) {
    await borrarArchivosDe(viejo.slug);
    borrarFila(viejo.slug);
  }
}

/** Borra el MP4 y cualquier resto del original de un video. */
export async function borrarArchivosDe(slug: string): Promise<void> {
  await rm(path.join(CONFIG.videos, `${slug}.mp4`), { force: true }).catch(() => {});
  await rm(path.join(CONFIG.trabajo, `${slug}.origen`), { force: true }).catch(() => {});
}

/** Cuánto ocupa hoy el cajón, en bytes. Se muestra en el panel. */
export function pesoDelCajon(): number {
  return listarVideos().reduce((total, v) => total + v.bytes, 0);
}

/* Una subida se puede quedar por la mitad sin que nadie avise: alguien cierra
   la pestaña, se corta internet y el navegador no llega ni a limpiar. Esa
   anotación queda en "Subiendo" para siempre, ocupa un lugar del cajón y su
   archivo a medias ocupa disco.

   Tres horas es holgado a propósito: es muchísimo más de lo que tarda cualquier
   subida de verdad, así que no hay riesgo de cortarle las piernas a una que
   todavía está andando. */
const HORAS_PARA_DARLA_POR_MUERTA = 3;

export async function limpiarSubidasAbandonadas(): Promise<void> {
  const limite = Date.now() - HORAS_PARA_DARLA_POR_MUERTA * 60 * 60 * 1000;

  for (const video of listarVideos()) {
    if (video.estado !== 'subiendo' || video.creado > limite) continue;
    await borrarArchivosDe(video.slug);
    borrarFila(video.slug);
  }
}
