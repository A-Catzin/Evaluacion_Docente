import { obtenerClienteSuperbase } from '../lib/supabaseClient';
import type { Observacion } from '../types/supabase';

const cliente = () => obtenerClienteSuperbase();

export async function enviarObservacion(data: Partial<Observacion>): Promise<Observacion> {
  const { data: result, error } = await cliente().from('observaciones').insert(data).select().single();
  if (error) {
    if (error.code === '23505') throw new Error('Ya existe una observación para este docente en este ciclo');
    throw new Error('Error al guardar observación: ' + error.message);
  }
  return result as Observacion;
}

export function calcularPromedioObservacion(obs: Observacion): number {
  const campos = [obs.cco1,obs.cco2,obs.cco3,obs.cco4,obs.cco5,obs.cco6,obs.cco7,
    obs.cme1,obs.cme2,obs.cme3,obs.cme4,obs.cme5,obs.cme6,obs.cme7,obs.cme8,obs.cme9,
    obs.ccom1,obs.ccom2,obs.ccom3,obs.ccom4,
    obs.cso1,obs.cso2,obs.cso3,obs.cso4,
    obs.cge1,obs.cge2,obs.cge3,obs.cge4,obs.cge5,obs.cge6,obs.cge7,
    obs.caf1,obs.caf2,
    obs.ctepe1,obs.ctepe2,obs.ctepe3,obs.ctepe4,obs.ctepe5,obs.ctepe6,obs.ctepe7,
    obs.cno1,obs.cno2,obs.cno3,obs.cno4,obs.cno5];
  const validos = campos.filter(v => v !== null && v !== undefined) as number[];
  if (validos.length === 0) return 0;
  const suma = validos.reduce((a, b) => a + b, 0);
  return Math.round((suma / (validos.length * 5)) * 100);
}

export async function obtenerObservacionesPorDocente(docenteId: number): Promise<Observacion[]> {
  const { data, error } = await cliente().from('observaciones').select('*').eq('docente_id', docenteId).order('fecha_observacion', { ascending: false });
  if (error) throw new Error('Error al obtener observaciones');
  return data as Observacion[];
}
