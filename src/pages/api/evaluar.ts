import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../lib/supabaseClient';
import { schemaEnvioEvaluacion } from '../../schemas/validacion';
import { enviarEvaluacion } from '../../services/evaluaciones';
import { moderarComentario } from '../../features/moderacion/blacklist';
import { calcularPromedioNormalizado } from '../../utils/normalizacion';
import type { ValorLikert } from '../../types/supabase';

/**
 * API: POST /api/evaluar
 *
 * Procesa el envío de una evaluación docente.
 *
 * Flujo de procesamiento:
 *   1. Verifica sesión via cookies (sb-access-token)
 *   2. Valida body con schemaEnvioEvaluacion (Zod)
 *   3. Sobrescribe id_evaluador con el de la sesión
 *   4. Modera comentario con blacklist si existe
 *   5. Normaliza respuestas a promedio base 100
 *   6. Inserta evaluación en la base de datos
 *   7. Retorna respuesta según el resultado
 *
 * @nota El id_evaluador se obtiene exclusivamente de la sesión.
 *       No se confía en el valor enviado en el body por seguridad.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    // ─── 1. Verificar sesión ──────────────────────────────────────
    const tokenAcceso = cookies.get('sb-access-token')?.value;
    const tokenRefresco = cookies.get('sb-refresh-token')?.value;

    if (!tokenAcceso || !tokenRefresco) {
      return new Response(
        JSON.stringify({ error: 'No autorizado.' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const cliente = obtenerClienteSuperbase();
    const { data: datosSesion, error: errorSesion } =
      await cliente.auth.setSession({
        access_token: tokenAcceso,
        refresh_token: tokenRefresco,
      });

    if (errorSesion || !datosSesion.user) {
      return new Response(
        JSON.stringify({ error: 'Sesión inválida.' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const idEvaluadorSesion = datosSesion.user.id;

    // ─── 2. Parsear y validar body ────────────────────────────────
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({
          error: 'Datos inválidos',
          detalles: [{ message: 'El body debe ser JSON válido.' }],
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const resultado = schemaEnvioEvaluacion.safeParse(body);

    if (!resultado.success) {
      const detalles = resultado.error.issues.map((issue) => ({
        campo: issue.path.join('.'),
        message: issue.message,
      }));

      return new Response(
        JSON.stringify({ error: 'Datos inválidos', detalles }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // ─── 3. Extraer datos validados (ignorar id_evaluador del body) ─
    const { id_carga, tipo_actor, respuestas, comentario } =
      resultado.data;

    // ─── 4. Moderar comentario ──────────────────────────────────
    let marcadoInapropiado = false;
    if (comentario && comentario.trim().length > 0) {
      const moderacion = moderarComentario(comentario);
      marcadoInapropiado = !moderacion.esApropiado;
    }

    // ─── 5. Normalizar respuestas ────────────────────────────────
    const respuestasValores = Object.values(respuestas) as ValorLikert[];
    const puntajePromedio = calcularPromedioNormalizado(respuestasValores);

    // Redondear a 2 decimales para DECIMAL(5,2)
    const puntajeRedondeado = Math.round(puntajePromedio * 100) / 100;

    // ─── 6. Insertar evaluación ──────────────────────────────────
    const evaluacion = await enviarEvaluacion({
      id_evaluador: idEvaluadorSesion,
      id_carga,
      tipo_actor,
      puntaje_promedio: puntajeRedondeado,
      comentario: comentario ?? null,
      marcado_inapropiado: marcadoInapropiado,
    });

    // ─── 7. Respuesta exitosa ────────────────────────────────────
    return new Response(
      JSON.stringify({
        success: true,
        id_evaluacion: evaluacion.id_evaluacion,
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: unknown) {
    // ─── Manejo de errores ────────────────────────────────────────

    // Error de voto duplicado (propagado desde enviarEvaluacion)
    if (
      error instanceof Error &&
      error.message === 'Esta carga académica ya fue evaluada.'
    ) {
      return new Response(
        JSON.stringify({
          error: 'Esta carga académica ya fue evaluada.',
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Error genérico
    console.error('[API Evaluar] Error interno:', error);
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor.' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
