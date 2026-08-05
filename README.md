# Miniplataforma de video

Para subir un video y llevarte un link que se pueda abrir desde cualquier lado,
sin depender de YouTube.

Vive en **video.emilianosalasporta.cloud**, aparte de la web principal. Son dos
proyectos separados, dos aplicaciones separadas en Dokploy y dos repos separados:
si un día esto falla, la web ni se entera.

---

## Cómo se usa

1. Entrás a **video.emilianosalasporta.cloud/admin** y ponés la contraseña.
2. Le ponés un título y elegís el archivo (o lo arrastrás hasta el recuadro).
   Sirve cualquier formato: `.wmv`, `.mp4`, `.mov`, `.avi`, `.mkv`.
3. Tocás **Subir y convertir** y esperás a que la barra llegue al final.
4. Cuando termina de subir, empieza la conversión, que tarda unos minutos.
   **Podés cerrar la pestaña**: el servidor sigue trabajando solo.
5. Cuando dice **Listo**, tocás **Copiar link** y lo mandás por donde quieras.

El que abre el link ve el título y el video. Nada más: sin menú, sin cuenta,
sin comentarios. Y puede adelantar y atrasar sin esperar a que baje todo.

### El cajón se vacía solo

Guarda los **últimos 5 videos**. Cuando subís el sexto, el más viejo se borra
solo, con su link.

Es a propósito: es lo que impide que esto crezca hasta llenar el disco del
servidor. Si el disco se llena, no se cae solo esta plataforma: se cae **todo**
lo que viva en el VPS, la web y el sistema de la DPRD incluidos.

Si alguna vez querés guardar más, se cambia el número de una variable (`MAX_VIDEOS`,
más abajo) sin tocar código. Pero cada video que sumás es disco que le sacás al
resto, así que conviene subirlo de a poco y mirando cuánto lugar queda.

---

## Antes de instalar: mirá el disco del VPS

Entrá a la terminal del VPS (en Hostinger: hPanel, tu VPS, *Browser terminal*)
y pegá esto:

```bash
df -h / && echo "--- DOCKER ---" && docker system df && echo "--- NUCLEOS ---" && nproc
```

Fijate en la columna **Avail** de la primera línea: es el disco que te queda
libre. Con el cajón en 5 videos esto ocupa menos de 1 GB, así que alcanza casi
siempre. Si te quedan **menos de 5 GB libres** conviene resolver eso antes,
porque el problema ya lo tenés con o sin esta plataforma.

El `nproc` del final dice cuántos núcleos tiene el servidor. Lo vas a necesitar
en el paso de los límites.

**Estado verificado el 2026-08-05:** disco de 96 GB con **87 GB libres** (10 %
usado) y **2 núcleos**. De sobra para esto.

---

## Instalar en Dokploy

Son ocho pasos. Hacelos en orden: el del volumen (paso 5) es el que no se puede
saltear.

### 1. Subir el proyecto a GitHub

**Doble clic en `PRIMERA-VEZ-SUBIR-A-GITHUB.bat`** (está en esta misma carpeta).
Te va a decir paso a paso qué hacer: crear el repo vacío en GitHub, copiar la
dirección y pegarla cuando te la pida.

De ahí en adelante, cada vez que cambie el código, el archivo a usar es
**`GUARDAR-Y-SUBIR.bat`**, igual que en la web.

### 2. Crear el registro DNS

Donde administrás el dominio `emilianosalasporta.cloud`, agregá:

| Campo | Valor |
|---|---|
| Tipo | `A` |
| Nombre | `video` |
| Valor | la IP de tu VPS |

Tarda entre 15 minutos y un par de horas en propagarse. Hacelo primero así
mientras seguís con lo demás va tomando.

Si el dominio pasa por Cloudflare con la **nube naranja** activada, ponela en
gris (solo DNS) para este subdominio: si no, el certificado de seguridad puede
no llegar a emitirse.

### 3. Crear la aplicación

En Dokploy, dentro de tu proyecto, creá un servicio nuevo y elegí **Application**.

Se abre un cuadro titulado **Create** que pide poco:

- **Name**: `video`
- **App Name**: se completa solo, dejalo como está
- **Description**: opcional

Tocá **Create**. La aplicación queda creada pero todavía vacía: no preguntó nada
del repo. Eso viene ahora.

### 4. Conectarla al repo

Entrá a la aplicación recién creada, pestaña **General**. Vas a ver tres
tarjetas, una abajo de la otra.

**En la tarjeta "Provider"**, elegí la solapa **Github** y completá:

- **Github Account**: tu cuenta
- **Repository**: el repo que creaste
- **Branch**: `main`
- **Build Path**: `/`
- **Trigger Type**: `On Push`

**En la tarjeta "Build Type"**, elegí **Dockerfile**. Van a aparecer tres campos
más (*Docker File*, *Docker Context Path*, *Docker Build Stage*): **dejalos los
tres vacíos**. Vacíos ya significan lo que necesitamos.

### 5. El volumen persistente (ESTE ES EL PASO IMPORTANTE)

Pestaña **Advanced**, tarjeta **Volumes**, botón **Add Volume**.

- **Mount Type**: **Volume Mount**
- **Volume Name**: `video-datos`
- **Mount Path (In the container)**: `/datos`

Guardá.

**Por qué Volume Mount y no Bind Mount:** el Volume Mount lo administra Docker
solo, no hace falta que la carpeta exista de antes, y es el único de los dos que
Dokploy sabe respaldar por su cuenta.

**Qué pasa si te salteás este paso:** todo funciona perfecto... hasta el primer
redeploy, cuando desaparecen todos los videos sin aviso ninguno. Por eso hay una
forma de verificarlo, y está en la sección de más abajo.

### 6. Los límites de recursos

Misma pestaña **Advanced**, tarjeta **Resources**. Esto es lo que evita que
convertir un video ahogue a la web y al sistema de la DPRD.

> **Ojo con estos dos campos, que tienen una trampa.** No se cargan en las
> unidades que uno esperaría: la memoria va **en bytes** y el procesador va en
> **milmillonésimas de núcleo**. Si escribís `1` pensando en "un núcleo", Dokploy
> lo toma como **una milmillonésima de núcleo** y la aplicación queda
> prácticamente sin procesador. Y no te avisa: el campo acepta cualquier cosa.

**La forma segura de cargarlos es no escribir nada.** Cada campo tiene un botón
**−** y un **+** a los costados, y **debajo del cuadro aparece en gris cuánto es
en criollo**. Tocá el **+** hasta que abajo diga lo que querés:

| Campo | Hasta que abajo diga | El número que queda |
|---|---|---|
| **Memory Limit** | `1 GB` | `1073741824` |
| **CPU Limit** | `1 CPU` | `1000000000` |

Los otros dos campos (*Memory Reservation* y *CPU Reservation*) dejalos vacíos.

**Por qué 1 CPU y no más: tu VPS tiene 2 núcleos** (verificado el 2026-08-05 con
`nproc`). Dándole uno, mientras convierte un video **siempre queda el otro libre**
para la web y para la DPRD. Si le dieras los dos, cada conversión les pisaría el
servidor durante varios minutos. La conversión tarda un poco más y no se nota
desde afuera: es exactamente el cambio que queremos.

El Memory Limit de 1 GB es un **techo**, no una reserva: el contenedor usa lo que
necesita (más o menos 300 MB entre el servidor y ffmpeg) y el límite solo actúa
si algo se desborda. No le estás sacando memoria a nadie.

### 7. Las variables de entorno

Pestaña **Environment**. Es un cuadro de texto grande donde va una variable por
línea, con el signo igual y sin espacios alrededor:

```
CLAVE_ADMIN=poné-acá-una-contraseña-larga
MAX_VIDEOS=5
MAX_MB=2048
FFMPEG_HILOS=1
```

Sobre la contraseña: es la única que hay y no se puede recuperar. Usá algo largo
(una frase de varias palabras sirve y se acuerda mejor que un revoltijo de
símbolos). Si la cambiás, se cierran solas todas las sesiones abiertas.

| Variable | Qué hace | Valor sugerido |
|---|---|---|
| `CLAVE_ADMIN` | La contraseña del panel. **Obligatoria.** | (la tuya) |
| `MAX_VIDEOS` | Cuántos videos guarda el cajón | `5` |
| `MAX_MB` | Peso máximo de un archivo | `2048` |
| `FFMPEG_HILOS` | Núcleos para convertir | `1` |
| `FFMPEG_CALIDAD` | Nitidez (más bajo = más nítido y más pesado) | `18` |
| `CARPETA_DATOS` | Dónde se guarda todo | `/datos` |

Las últimas dos ya vienen puestas por defecto: solo cargalas si querés cambiarlas.

Después de tocar **Save** acá, hay que tocar **Reload** en la pestaña General
para que los cambios entren en vigor.

### 8. El dominio

Pestaña **Domains**, agregar:

- **Host**: `video.emilianosalasporta.cloud`
- **Path**: `/`
- **Container Port**: `4321`
- **HTTPS**: activado
- **Certificate Provider**: `Let's Encrypt`

### Y ahora sí: Deploy

Volvé a la pestaña **General** y tocá **Deploy**. La primera vez tarda unos
minutos porque tiene que bajar e instalar todo, ffmpeg incluido.

Cuando termine, entrá a `video.emilianosalasporta.cloud/admin`.

> **Sobre los botones Deploy y Reload.** Están los dos en la pestaña General y
> hacen cosas distintas. **Deploy** vuelve a bajar el código de GitHub y
> reconstruye todo: tarda minutos, y es el que hay que usar cuando cambió el
> código. **Reload** solo vuelve a levantar el contenedor con la configuración
> nueva: tarda segundos, y alcanza para cuando tocaste una variable de entorno,
> un volumen o un límite de recursos.
>
> Ojo con esto: **cambiar una variable de entorno y tocar Save NO la aplica.**
> Queda guardada pero el contenedor sigue andando con la de antes hasta que
> toques Reload. Dokploy no te lo avisa y es el paso que más se olvida.
>
> (Vas a ver que varios carteles de Dokploy dicen "click Redeploy". Ese botón no
> existe: le están diciendo Deploy.)

---

## Verificar que el volumen quedó bien montado

**Hacelo ANTES de subir el primer video que te importe.** Es la única forma de
saber que los videos no se van a evaporar en el próximo redeploy.

Abajo de todo en el panel hay una línea chiquita que dice algo así:

```
Datos en /datos · en uso desde 05/08/2026 14:32
```

La prueba es esta:

1. **Anotá esa fecha y esa hora.**
2. Andá a Dokploy, pestaña **General**, y tocá **Reload** (tarda segundos).
3. Cuando termine, recargá el panel.
4. Mirá la misma línea otra vez.

- **Si la fecha es la misma:** el volumen está bien montado. Listo, ya está.
- **Si la fecha cambió a la de ahora:** el volumen **NO** está montado, y todo lo
  que subas se va a borrar solo. Volvé al paso 5, revisá que el *Mount Path*
  diga exactamente `/datos` (con la barra adelante), guardá y tocá Reload otra
  vez.

Si querés confirmarlo también desde el servidor:

```bash
docker volume inspect video-datos --format '{{ .Mountpoint }}'
```

Te devuelve la carpeta real del VPS donde están guardados los videos. Anotala,
la vas a usar para el backup.

---

## Backup de los videos

Primero lo honesto: **con el cajón en 5 videos que se pisan solos, acá no hay
casi nada que respaldar.** Estos videos son de usar y tirar; el original lo
tenés en tu compu. Si perdés el volumen, perdés los links, no el material.

Dicho eso, si alguna vez querés llevarte una copia, entrá al VPS y corré:

```bash
docker run --rm -v video-datos:/datos -v /root:/backup alpine tar czf /backup/videos-respaldo.tar.gz -C /datos .
```

Eso te deja el archivo `videos-respaldo.tar.gz` en la carpeta `/root` del
servidor, con los videos y la base adentro. Después lo bajás a tu compu con
cualquier programa de SFTP (FileZilla, WinSCP) conectándote al VPS.

Para restaurarlo, el camino inverso:

```bash
docker run --rm -v video-datos:/datos -v /root:/backup alpine tar xzf /backup/videos-respaldo.tar.gz -C /datos
```

Dokploy también trae una función de **Volume Backups** (una pestaña de la
aplicación) que hace esto solo y todos los días contra un S3. Para este caso es
más de lo que hace falta, pero está ahí si algún día lo querés.

---

## Si algo falla

**El panel dice "Falta cargar la contraseña en el servidor".**
No cargaste `CLAVE_ADMIN` en la pestaña Environment, o la cargaste y no
redeployaste.

**Sale 502 Bad Gateway.**
El contenedor no está andando o no lo alcanza el repartidor de tráfico.
Mirá la pestaña **Logs** de la aplicación. Revisá también que el **Container
Port** del dominio diga `4321`.

**Un video queda en "Falló" con un mensaje de ffmpeg.**
El mensaje que aparece abajo del video es el que dio ffmpeg. Lo más común es un
archivo cortado a la mitad o que no es un video. Volvé a subirlo.

**Un video se queda "Convirtiendo" para siempre.**
Si el servidor se reinició en el medio, al arrancar de nuevo esos videos se
marcan como fallados solos. Si sigue así después de un redeploy, mirá los Logs.

**Se cortó la subida a la mitad.**
El archivo se manda en pedazos de 4 MB y cada uno se reintenta tres veces antes
de darse por vencido; si el pedazo ya había llegado, el servidor le dice al
navegador por dónde iba y la subida sigue desde ahí en vez de empezar de nuevo.
Si aun así falla, es la conexión. La anotación a medias se borra sola, así que
podés volver a intentar sin que quede basura ocupando lugar.

**Dice "Demasiados intentos, probá en X minutos".**
Es el freno contra el que se pone a probar contraseñas: salta a los 8 errores
seguidos desde la misma conexión. Esperá lo que diga y volvé a probar; también
se destraba solo. Si tenés apuro, entrá desde el celular con los datos móviles
(es otra conexión, así que no está frenada).

**Me olvidé la contraseña.**
No se puede recuperar, pero se cambia en un minuto: Dokploy, pestaña
**Environment**, cambiás `CLAVE_ADMIN`, **Save**, y después **Reload** en la
pestaña General. Los videos y los links no se tocan.

**Subí un video y la web principal se puso lenta.**
No debería, con `CPU Limit` en 1. Si pasa, bajá `FFMPEG_HILOS` a `1` (si estaba
en más) y revisá que el límite de CPU esté cargado en la pestaña Advanced.

---

## Para el que quiera saber cómo funciona por dentro

**Astro en modo servidor** con el adapter de Node, corriendo en un contenedor
con **ffmpeg** instalado. Los datos (videos + base SQLite) viven en `/datos`,
que es el volumen persistente.

- **La subida va en pedazos de 4 MB.** No es un capricho: el repartidor de
  tráfico del VPS (Traefik) corta cualquier envío que tarde más de un minuto, y
  la alternativa era aflojarle ese límite, que es una configuración **global** y
  se la estaríamos tocando también a la web y a la DPRD. En pedacitos, cada
  envío tarda segundos y nunca se acerca al límite. De yapa, si se corta la
  conexión se reintenta solo ese pedazo y no toda la subida.

  Cada pedazo se escribe **en su posición exacta** del archivo, no pegado al
  final. Suena a detalle y no lo es: si el pedazo llegó bien pero la respuesta se
  perdió en el camino, el navegador lo manda de nuevo, y escribiendo por posición
  los mismos bytes caen en el mismo lugar y no pasa nada. Pegando al final
  quedaban duplicados y el video salía cortado, sin ningún error que avisara.

- **La conversión es de a un video por vez.** Hay una fila de espera: si mandás
  dos, el segundo espera al primero. Es otro freno para no ahogar al servidor.

- **No se reduce la resolución.** Son capturas de pantalla con texto chico: el
  video sale del mismo tamaño que entró, con calidad alta (CRF 18). Si el
  archivo que subís YA es un MP4 compatible, ni se recomprime: solo se reordena
  por dentro, que es instantáneo y no pierde nada.

- **El original se borra siempre**, salga bien o mal la conversión.

- **Los links son impredecibles.** 12 caracteres al azar sacados del generador
  criptográfico del sistema, de un alfabeto de 31 (sin las letras que se
  confunden al dictar). Nada de numerar los videos 1, 2, 3.

- **Se puede adelantar sin bajar todo** porque el servidor entiende los pedidos
  por rango (`Range`) y contesta solo el pedazo que el reproductor le pide.

- **No le pide nada a ningún servidor ajeno.** Las tipografías se sirven desde
  el propio dominio y el reproductor es el del navegador. Igual que la web
  principal, y por el mismo motivo.

- **Nada se indexa.** Todas las páginas van con `noindex`, así un link no
  termina apareciendo en Google.

### Comandos

```
npm install       # instalar las dependencias (una sola vez)
npm run build     # construir
npm run local     # probar en tu compu, en http://localhost:4322/admin
```

En modo local la contraseña es `prueba`, el cajón guarda 3 videos y todo se
guarda en `datos-local/`, que no se sube a GitHub.
