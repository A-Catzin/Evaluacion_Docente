import { obtenerClienteSuperbase } from '../lib/supabaseClient';
import type { EncuestaEstudiantil } from '../types/supabase';
import { calcularPromedioEncuesta } from '../types/supabase';

const cliente = () => obtenerClienteSuperbase();

export async function enviarEncuesta(data: Partial<EncuestaEstudiantil>): Promise<{ id: number; promedio: number }> {
  const { data: result, error } = await cliente().from('encuesta_estudiantil').insert(data).select('*').single();
  if (error) throw new Error('Error al guardar encuesta');
  const ee = result as EncuestaEstudiantil;
  return { id: ee.id, promedio: calcularPromedioEncuesta(ee) };
}

export async function obtenerEncuestasPorDocente(docenteId: number): Promise<EncuestaEstudiantil[]> {
  const { data, error } = await cliente().from('encuesta_estudiantil').select('*').eq('docente_id', docenteId).order('fecha_respuesta', { ascending: false });
  if (error) throw new Error('Error al obtener encuestas');
  return data as EncuestaEstudiantil[];
}

export async function obtenerPromedioGeneral(docenteId: number): Promise<number> {
  const encuestas = await obtenerEncuestasPorDocente(docenteId);
  if (encuestas.length === 0) return 0;
  const promedios = encuestas.map(e => calcularPromedioEncuesta(e));
  return Math.round(promedios.reduce((a, b) => a + b, 0) / promedios.length);
}

export async function verificarEncuestaEnviada(estudianteId: number, grupoId: number, cuatrimestreId: number): Promise<boolean> {
  const { data } = await cliente().from('encuesta_control_envio').select('id').eq('estudiante_id', estudianteId).eq('grupo_id', grupoId).eq('cuatrimestre_id', cuatrimestreId).maybeSingle();
  return !!data;
}
