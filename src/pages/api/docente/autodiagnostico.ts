import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';
import { obtenerUsuarioAutenticado } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await obtenerUsuarioAutenticado(cookies);
  if (!user || user.rol !== 'docente') return new Response(JSON.stringify({ error: 'Solo docentes' }), { status: 403 });

  const body = await request.json();
  const { cuatrimestre_id, nombre, apellido_paterno, apellido_materno, campus, oferta_academica, turno, modalidad, reactivos, comentarios } = body;

  const cliente = obtenerClienteSuperbase();
  // Buscar o crear entidad_id
  let docenteId: number | null = null;
  const { data: usuario } = await cliente.from('usuarios').select('entidad_id').eq('id', user.id).maybeSingle();
  docenteId = usuario?.entidad_id || null;

  if (!docenteId) {
    const { data: existenteDoc } = await cliente.from('docentes').select('id').eq('email', user.email).maybeSingle();
    if (existenteDoc) {
      docenteId = existenteDoc.id;
      await cliente.from('usuarios').update({ entidad_id: docenteId }).eq('id', user.id);
    } else {
      const apellidos = `${apellido_paterno} ${apellido_materno}`.trim();
      const { data: nuevo } = await cliente.from('docentes').insert({ nombre, apellido_paterno, apellido_materno, apellidos, email: user.email, campus, turno, oferta_academica, modalidad }).select('id').single();
      if (!nuevo) return new Response(JSON.stringify({ error: 'Error al crear docente' }), { status: 500 });
      docenteId = nuevo.id;
      await cliente.from('usuarios').update({ entidad_id: docenteId }).eq('id', user.id);
    }
  } else {
    await cliente.from('docentes').update({ nombre, apellido_paterno, apellido_materno, apellidos: `${apellido_paterno} ${apellido_materno}`.trim(), campus, turno, oferta_academica, modalidad }).eq('id', docenteId);
  }

  const insert: Record<string,unknown> = { docente_id: docenteId, cuatrimestre_id };
  for (let i=0;i<24;i++) insert[`r${i+1}`] = reactivos[i];
  if (comentarios) insert.comentarios = comentarios;
  const { data: resultado, error } = await cliente.from('autodiagnosticos').insert(insert).select('puntaje_total').single();
  if (error) return new Response(JSON.stringify({ error: error.code==='23505'?'Ya completaste tu autodiagnóstico':error.message }), { status: 400 });

  const promedio = Math.round((resultado.puntaje_total/120)*100);
  return new Response(JSON.stringify({ success:true, promedio }), { status: 201 });
};
