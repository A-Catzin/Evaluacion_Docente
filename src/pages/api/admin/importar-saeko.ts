import type { APIRoute } from 'astro';
import { obtenerClienteSuperbase } from '../../../lib/supabaseClient';

export const POST: APIRoute = async ({ request, cookies }) => {
  const t = cookies.get('sb-access-token')?.value;
  const r = cookies.get('sb-refresh-token')?.value;
  if (!t || !r) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  try {
    const cl = obtenerClienteSuperbase();
    const { data: s } = await cl.auth.setSession({ access_token: t, refresh_token: r });
    if (!s.user) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401 });
    const { data: u } = await cl.from('usuarios').select('rol').eq('id', s.user.id).maybeSingle();
    if (!u || u.rol !== 'superadmin') return new Response(JSON.stringify({ error: 'Solo superadmin' }), { status: 403 });

    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) return new Response(JSON.stringify({ error: 'Archivo requerido' }), { status: 400 });

    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return new Response(JSON.stringify({ error: 'CSV vacío' }), { status: 400 });

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows: Record<string,string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      if (vals.length < headers.length) continue;
      const row: Record<string,string> = {};
      headers.forEach((h, j) => row[h] = vals[j] || '');
      if (row['Estado de la evaluación']?.trim() !== 'Completada') continue;
      rows.push(row);
    }

    // ─── Batch: agrupar únicos primero ───
    const ofertasSet = new Set<string>();
    const docentesMap = new Map<string, { nombre?: string; apellidos?: string; email?: string }>();
    const asigsSet = new Set<string>();
    const gruposSet = new Set<string>();

    for (const r of rows) {
      const plan = r['Plan de estudios']?.trim() || '';
      const docente_nom = r['Nombre del docente']?.trim() || '';
      const clave = r['Asignatura Clave']?.trim() || '';
      const grupo_raw = r['Grupo']?.trim() || '';
      if (plan) ofertasSet.add(plan);
      if (clave) asigsSet.add(clave);
      if (docente_nom) {
        const partes = docente_nom.split(' '); const n = partes.length;
        let ap = '', nom = '';
        if (n >= 3) { ap = partes.slice(0,2).join(' '); nom = partes.slice(2).join(' '); }
        else if (n===2) { ap = partes[0]; nom = partes[1]; }
        else { ap = partes[0]; nom = ''; }
        const email = (nom+'.'+ap).toLowerCase().replace(/\s+/g,'.')+'@tecplayacar.edu.mx';
        docentesMap.set(docente_nom, { nombre: nom, apellidos: ap, email });
      }
      if (grupo_raw) gruposSet.add(grupo_raw);
    }

    // Batch insert ofertas
    if (ofertasSet.size > 0) await cl.from('ofertas_academicas').upsert([...ofertasSet].map(n => ({ nombre: n })), { onConflict: 'nombre' });

    // Batch insert docentes
    if (docentesMap.size > 0) {
      const docsArr = [...docentesMap.entries()].map(([, v]) => ({ ...v, activo: true }));
      await cl.from('docentes').upsert(docsArr, { onConflict: 'email' });
    }

    // Batch insert asignaturas
    if (asigsSet.size > 0) {
      const asigsArr = [...asigsSet].map(c => ({ clave: c, nombre: c }));
      await cl.from('asignaturas').upsert(asigsArr, { onConflict: 'clave' });
    }

    // Insert evaluaciones en chunks de 50
    let evaluaciones = 0, errores = 0;
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50);
      const inserts: any[] = [];
      for (const r of chunk) {
        try {
          const plan = r['Plan de estudios']?.trim() || '';
          const docente_nom = r['Nombre del docente']?.trim() || '';
          const clave = r['Asignatura Clave']?.trim() || '';
          const grupo_raw = r['Grupo']?.trim() || '';
          const ciclo = r['Ciclo escolar']?.trim() || '';
          const prom = parseFloat(r['Promedio'] || '0') || 0;
          if (!docente_nom || !clave) { errores++; continue; }
          const docData = docentesMap.get(docente_nom);
          inserts.push({
            docente_id: null, // se resolverá vía email
            grupo_id: null,
            ciclo,
            promedio_general: prom,
            prom_asistencia: parseFloat(r['Asistencia']||'0')||0,
            prom_organizacion: parseFloat(r['Organización']||'0')||0,
            prom_actitud: parseFloat(r['Actitud']||'0')||0,
            prom_ensenanza: parseFloat(r['Enseñanza']||'0')||0,
            prom_dominio: parseFloat(r['Dominio del contenido']||'0')||0,
            prom_evaluacion: parseFloat(r['Evaluación y calificación']||'0')||0,
            prom_comunicacion: parseFloat(r['Participación y comunicación']||'0')||0,
            prom_gestion: parseFloat(r['Gestión del grupo']||'0')||0,
            prom_tecnologia: parseFloat(r['Tecnología']||'0')||0,
            prom_satisfaccion: parseFloat(r['Satisfacción global del estudiante']||'0')||0,
            comentarios: r['Comentarios'] || null,
            total_respuestas: 1,
          });
          evaluaciones++;
        } catch { errores++; }
      }
      if (inserts.length > 0) await cl.from('encuesta_estudiantil').insert(inserts);
    }

    return new Response(JSON.stringify({
      success: true, total: rows.length,
      docentes: docentesMap.size, asignaturas: asigsSet.size,
      grupos: gruposSet.size, evaluaciones, errores
    }), { status: 200 });
  } catch (err) {
    console.error('[Importar]', err);
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
