/* Atajos para contestar desde los endpoints, así no se repite el
   mismo encabezado en cada archivo. */

export function json(datos: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  });
}

export function error(mensaje: string, status = 400): Response {
  return json({ error: mensaje }, status);
}

/** Lee el cuerpo de una petición como JSON sin romperse si viene basura. */
export async function leerJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const datos = await request.json();
    return typeof datos === 'object' && datos !== null ? (datos as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
