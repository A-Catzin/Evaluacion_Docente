import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';

export const POST: APIRoute = async ({ request, cookies }) => {
  const tokenAcceso = cookies.get('sb-access-token')?.value;
  const tokenRefresco = cookies.get('sb-refresh-token')?.value;
  if (!tokenAcceso || !tokenRefresco) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });

  try {
    const cliente = obtenerClienteSuperbase();
    const { data: sesion } = await cliente.auth.setSession({ access_token: tokenAcceso, refresh_token: tokenRefresco });
    if (!sesion.user) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401 });

    const { data: usuario } = await cliente.from('usuarios').select('entidad_id,rol,email').eq('id', sesion.user.id).maybeSingle();
    if (!usuario || usuario.rol !== 'docente') {
      return new Response(JSON.stringify({ error: 'Solo docentes pueden enviar autodiagnóstico' }), { status: 403 });
    }

    const body = await request.json();
    const { cuatrimestre_id, nombre, apellido_paterno, apellido_materno, campus, oferta_academica, turno, reactivos, comentarios } = body;

    if (!cuatrimestre_id || !nombre || !apellido_paterno || !apellido_materno || !campus || !oferta_academica || !turno || !reactivos || reactivos.length !== 24) {
      return new Response(JSON.stringify({ error: 'Todos los campos son obligatorios excepto comentarios' }), { status: 400 });
    }

    // 1. Crear o actualizar docente
    let docenteId = usuario.entidad_id;
    const apellidos = `${apellido_paterno} ${apellido_materno}`.trim();

    if (docenteId) {
      const { error: errUpd } = await cliente.from('docentes').update({
        nombre, apellido_paterno, apellido_materno, apellidos,
        campus, turno, oferta_academica,
      }).eq('id', docenteId);
      if (errUpd) throw new Error('Error al actualizar docente');
    } else {
      const { data: nuevo, error: errIns } = await cliente.from('docentes').insert({
        nombre, apellido_paterno, apellido_materno, apellidos,
        email: usuario.email, campus, turno, oferta_academica,
      }).select('id').single();
      if (errIns) throw new Error('Error al crear docente');
      docenteId = nuevo.id;
      await cliente.from('usuarios').update({ entidad_id: docenteId }).eq('id', sesion.user.id);
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
    if (comentarios) insert.comentarios = comentarios;

    const { data: resultado, error: errDiag } = await cliente.from('autodiagnosticos').insert(insert).select('puntaje_total,nivel_desempeno').single();
    if (errDiag) throw new Error('Error al guardar autodiagnóstico');

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
