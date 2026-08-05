// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Configuración de la miniplataforma de video.
//
// A diferencia de la web principal (que es 100% estática y se sirve con nginx),
// esta necesita un servidor de verdad andando: tiene que recibir archivos,
// convertirlos con ffmpeg y servirlos. De ahí el `output: 'server'`.
export default defineConfig({
  output: 'server',

  // El adapter 'standalone' arma un servidor Node completo en dist/server/entry.mjs.
  // Se arranca con `node ./dist/server/entry.mjs` y no necesita nada más.
  adapter: node({ mode: 'standalone' }),

  server: {
    // host: true = escuchar en 0.0.0.0 y no solo en 127.0.0.1.
    // SIN ESTO, adentro de Docker el contenedor arranca bien pero nadie lo
    // puede alcanzar desde afuera: Traefik golpea la puerta y no atiende nadie.
    host: true,
    port: 4321,
  },

  // Acá no se procesa ninguna imagen: los videos van tal cual y no hay fotos.
  // Con esto Astro no carga `sharp` (su procesador de imágenes, 28 MB de código
  // nativo), que si no se cargaría al arrancar para nada. Menos memoria en uso y
  // una pieza menos que pueda fallar dentro del contenedor.
  image: {
    service: { entrypoint: 'astro/assets/services/noop' },
  },

  // El sitio no se indexa (ver el <meta name="robots"> del layout), pero igual
  // dejamos la dirección declarada para que los enlaces absolutos salgan bien.
  site: 'https://video.emilianosalasporta.cloud',
});
