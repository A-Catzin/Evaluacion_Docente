import type { APIRoute } from 'astro';
import { AuthError, requireRole } from '../../../lib/auth';
import { validarComentarioOpcional } from '../../../lib/moderation';
import { AutodiagnosticoSchema } from '../../../lib/validation/apiSchemas';
import { formatZodFieldErrors } from '../../../lib/validation/errors';

export const POST: APIRoute = async ({ request, cookies }) => {
  let cliente;
  let userId: string;
  try {
    const auth = await requireRole(cookies, ['docente', 'pendiente']);
    cliente = auth.client;
    userId = auth.user.id;
  } catch (error) {
    if (error instanceof AuthError) return error.response;
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }

  try {
    const { data: usuario } = await cliente.from('usuarios').select('entidad_id,rol,email').eq('id', userId).maybeSingle();
    if (!usuario) {
      return new Response(JSON.stringify({ error: 'Solo docentes pueden enviar autodiagnóstico' }), { status: 403 });
    }

        const body = await request.json();
        const parseResult = AutodiagnosticoSchema.safeParse(body);
        if (!parseResult.success) {
          return new Response(
            JSON.stringify({ error: 'Todos los campos son obligatorios excepto comentarios', detalles: formatZodFieldErrors(parseResult.error) }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          );
        }
        const { cuatrimestre_id, nombre, apellido_paterno, apellido_materno, campus, oferta_academica, turno, modalidad, reactivos, comentarios } = parseResult.data;

        const moderacion = validarComentarioOpcional(comentarios, 500);
        if (!moderacion.valido) {
          return new Response(
            JSON.stringify({ error: moderacion.error, code: 'comment_rejected' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          );
        }

    // 1. Crear o actualizar docente
    let docenteId = usuario.entidad_id;
    const apellidos = `${apellido_paterno} ${apellido_materno}`.trim();

    // Si es pendiente, auto-asignar rol docente al completar AD
    if (usuario.rol === 'pendiente') {
      await cliente.from('usuarios').update({ rol: 'docente' }).eq('id', userId);
    }

    if (docenteId) {
      const { error: errUpd } = await cliente.from('docentes').update({
        nombre, apellido_paterno, apellido_materno, apellidos,
        campus, turno, oferta_academica, modalidad,
      }).eq('id', docenteId);
      if (errUpd) throw new Error('Error al actualizar docente: ' + errUpd.message);
    } else {
      const { data: existenteDoc } = await cliente.from('docentes').select('id').eq('email', usuario.email).maybeSingle();
      if (existenteDoc) {
        docenteId = existenteDoc.id;
        await cliente.from('usuarios').update({ entidad_id: docenteId }).eq('id', userId);
        await cliente.from('docentes').update({
          nombre, apellido_paterno, apellido_materno, apellidos,
          campus, turno, oferta_academica, modalidad,
        }).eq('id', docenteId);
      } else {
        const { data: nuevo, error: errIns } = await cliente.from('docentes').insert({
          nombre, apellido_paterno, apellido_materno, apellidos,
          email: usuario.email, campus, turno, oferta_academica, modalidad,
        }).select('id').single();
        if (errIns) throw new Error('Error al crear docente: ' + errIns.message);
        docenteId = nuevo.id;
        await cliente.from('usuarios').update({ entidad_id: docenteId }).eq('id', userId);
      }
    }

    // 2. Verificar si ya respondió
    const { data: existente } = await cliente.from('autodiagnosticos').select('id').eq('docente_id', docenteId).eq('cuatrimestre_id', cuatrimestre_id).maybeSingle();
    if (existente) {
      return new Response(JSON.stringify({ error: 'Ya completaste tu autodiagnóstico para este cuatrimestre' }), { status: 409 });
    }

    // 3. Insertar autodiagnóstico
    const insert: Record<string, unknown> = { docente_id: docenteId, cuatrimestre_id };
    for (let i = 0; i < 24; i++) insert[`r${i + 1}`] = reactivos[i];

    const suma = reactivos.reduce((a: number, b: number) => a + b, 0);
    const promedio = Math.round((suma / 120) * 100);
    let nivel = 'Necesita Mejora';
    if (promedio >= 90) nivel = 'Excelente';
    else if (promedio >= 75) nivel = 'Satisfactorio';
    else if (promedio >= 60) nivel = 'En Desarrollo';
    insert.nivel_desempeno = nivel;
    if (moderacion.valorNormalizado) insert.comentarios = moderacion.valorNormalizado;

    const { data: resultado, error: errDiag } = await cliente.from('autodiagnosticos').insert(insert).select('puntaje_total,nivel_desempeno').single();
    if (errDiag) {
      console.error('[API Autodiagnóstico] Error insert:', errDiag);
      throw new Error('Error al guardar autodiagnóstico: ' + errDiag.message);
    }

    return new Response(JSON.stringify({
      success: true,
      puntaje_total: resultado.puntaje_total,
      promedio,
      nivel_desempeno: resultado.nivel_desempeno,
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Error al guardar' }), { status: 500 });
  }
};
