import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';
import { enviarAutodiagnostico } from '../../../services/autodiagnostico';

export const POST: APIRoute = async ({ request, cookies }) => {
  const tokenAcceso = cookies.get('sb-access-token')?.value;
  const tokenRefresco = cookies.get('sb-refresh-token')?.value;
  if (!tokenAcceso || !tokenRefresco) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });

  try {
    const cliente = obtenerClienteSuperbase();
    const { data: sesion } = await cliente.auth.setSession({ access_token: tokenAcceso, refresh_token: tokenRefresco });
    if (!sesion.user) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401 });

    const { data: usuario } = await cliente.from('usuarios').select('entidad_id,rol').eq('id', sesion.user.id).maybeSingle();
    if (!usuario || usuario.rol !== 'docente' || !usuario.entidad_id) {
      return new Response(JSON.stringify({ error: 'Solo docentes pueden enviar autodiagnóstico' }), { status: 403 });
    }

    const body = await request.json();
    const { cuatrimestre_id, nombre, apellido_paterno, apellido_materno, campus, oferta_academica, turno, reactivos, comentarios } = body;

    if (!cuatrimestre_id || !nombre || !apellido_paterno || !apellido_materno || !campus || !oferta_academica || !turno || !reactivos || reactivos.length !== 24) {
      return new Response(JSON.stringify({ error: 'Todos los campos son obligatorios excepto comentarios' }), { status: 400 });
    }

    const resultado = await enviarAutodiagnostico({
      docente_id: usuario.entidad_id,
      cuatrimestre_id,
      nombre,
      apellido_paterno,
      apellido_materno,
      campus,
      oferta_academica,
      turno,
      reactivos,
      comentarios,
    });

    const suma = reactivos.reduce((a: number, b: number) => a + b, 0);
    const promedio = Math.round((suma / 120) * 100);

    return new Response(JSON.stringify({
      success: true,
      puntaje_total: resultado.puntaje_total,
      promedio,
      nivel_desempeno: resultado.nivel_desempeno,
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    if (err instanceof Error && err.message.includes('Ya completaste')) {
      return new Response(JSON.stringify({ error: err.message }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: 'Error al guardar' }), { status: 500 });
  }
};
