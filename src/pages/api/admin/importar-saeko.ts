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

    // Parsear headers
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      if (vals.length < headers.length) continue;
      const row: Record<string, string> = {};
      headers.forEach((h, j) => row[h] = vals[j] || '');
      if (row['Estado de la evaluación']?.trim() !== 'Completada') continue;
      rows.push(row);
    }

    let ofertas = 0, docentes = 0, asignaturas = 0, grupos = 0, evaluaciones = 0, errores = 0;

    for (const r of rows) {
      try {
        const plan = r['Plan de estudios']?.trim() || '';
        const grupo_raw = r['Grupo']?.trim() || '';
        const clave = r['Asignatura Clave']?.trim() || '';
        const clase = r['Nombre de la clase']?.trim() || '';
        const docente_nom = r['Nombre del docente']?.trim() || '';
        const ciclo = r['Ciclo escolar']?.trim() || '';
        const prom = parseFloat(r['Promedio'] || '0') || 0;

        if (!plan || !docente_nom || !clave) { errores++; continue; }

        // 1. Oferta
        await cl.from('ofertas_academicas').upsert({ nombre: plan }, { onConflict: 'nombre' });
        ofertas++;

        // 2. Docente
        const partes = docente_nom.split(' '); const n = partes.length;
        let ap = '', nom = '';
        if (n >= 3) { ap = partes.slice(0, 2).join(' '); nom = partes.slice(2).join(' '); }
        else if (n === 2) { ap = partes[0]; nom = partes[1]; }
        else { ap = partes[0]; nom = ''; }
        const email = (nom + '.' + ap).toLowerCase().replace(/\s+/g, '.') + '@tecplayacar.edu.mx';
        const { data: docData } = await cl.from('docentes').upsert({ nombre: nom, apellidos: ap, email, activo: true }, { onConflict: 'email' }).select('id').single();
        docentes++;

        // 3. Asignatura
        await cl.from('asignaturas').upsert({ clave, nombre: clase }, { onConflict: 'clave' });
        asignaturas++;

        // 4. Grupo (clave única)
        const gid = grupo_raw.replace(/\s+/g, '_').replace(/-/g, '_').substring(0, 50);
        const { data: gData } = await cl.from('grupos').upsert({ clave: gid, docente_id: docData?.id, cuatrimestre_id: null }, { onConflict: 'clave' }).select('id').single();
        grupos++;

        // 5. Evaluación
        await cl.from('encuesta_estudiantil').upsert({
          docente_id: docData?.id,
          grupo_id: gData?.id,
          asignatura_id: null,
          ciclo,
          promedio_general: prom,
          prom_asistencia: parseFloat(r['Asistencia'] || '0') || 0,
          prom_organizacion: parseFloat(r['Organización'] || '0') || 0,
          prom_actitud: parseFloat(r['Actitud'] || '0') || 0,
          prom_ensenanza: parseFloat(r['Enseñanza'] || '0') || 0,
          prom_dominio: parseFloat(r['Dominio del contenido'] || '0') || 0,
          prom_evaluacion: parseFloat(r['Evaluación y calificación'] || '0') || 0,
          prom_comunicacion: parseFloat(r['Participación y comunicación'] || '0') || 0,
          prom_gestion: parseFloat(r['Gestión del grupo'] || '0') || 0,
          prom_tecnologia: parseFloat(r['Tecnología'] || '0') || 0,
          prom_satisfaccion: parseFloat(r['Satisfacción global del estudiante'] || '0') || 0,
          comentarios: r['Comentarios'] || null,
          total_respuestas: 1,
        }, { onConflict: 'docente_id,asignatura_id,grupo_id,ciclo' });
        evaluaciones++;
      } catch { errores++; }
    }

    return new Response(JSON.stringify({ success: true, total: rows.length, docentes, asignaturas, grupos, evaluaciones, errores }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
