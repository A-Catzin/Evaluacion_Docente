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

    // Cargar emails reales del CSV maestro
    const emailMap = new Map<string, string>();
    try {
      const { data: docsDB } = await cl.from('docentes').select('nombre,apellidos,email').eq('activo', true);
      for (const d of (docsDB || [])) {
        const key = (d.nombre + ' ' + d.apellidos).toUpperCase().trim();
        if (d.email) emailMap.set(key, d.email);
      }
    } catch {}

    function normalizarNombre(n: string) {
      return n.toUpperCase().replace(/\s+/g, ' ').trim();
    }

    // ─── Agrupar únicos ───
    const ofertasSet = new Set<string>();
    const docentesMap = new Map<string, { nombre: string; apellidos: string; email: string }>();
    const asigsMap = new Map<string, string>(); // clave → nombre
    const gruposSet = new Set<string>();

    for (const r of rows) {
      const plan = r['Plan de estudios']?.trim() || '';
      const docente_nom = r['Nombre del docente']?.trim() || '';
      const clave = r['Asignatura Clave']?.trim() || '';
      const clase = r['Nombre de la clase']?.trim() || '';
      const grupo_raw = r['Grupo']?.trim() || '';
      if (plan) ofertasSet.add(plan);
      if (clave && clase) asigsMap.set(clave, clase);
      if (docente_nom && !docentesMap.has(docente_nom)) {
        const partes = docente_nom.split(' '); const n = partes.length;
        let ap = '', nom = '';
        if (n >= 3) { ap = partes.slice(0,2).join(' '); nom = partes.slice(2).join(' '); }
        else if (n===2) { ap = partes[0]; nom = partes[1]; }
        else { ap = partes[0]; nom = ''; }
        // Buscar email real
        const key = normalizarNombre(docente_nom);
        let email = emailMap.get(key) || '';
        // Fuzzy match
        if (!email) {
          for (const [k, v] of emailMap) {
            const words = key.split(' ');
            if (words.length >= 2 && k.includes(words[0]) && k.includes(words[words.length-1])) { email = v; break; }
          }
        }
        if (!email) email = (nom+'.'+ap).toLowerCase().replace(/\s+/g,'.')+'@tecplayacar.edu.mx';
        docentesMap.set(docente_nom, { nombre: nom, apellidos: ap, email });
      }
      if (grupo_raw) gruposSet.add(grupo_raw);
    }

    // Batch inserts
    if (ofertasSet.size > 0) await cl.from('ofertas_academicas').upsert([...ofertasSet].map(n => ({ nombre: n })), { onConflict: 'nombre' });

    if (docentesMap.size > 0) {
      const docsArr = [...docentesMap.values()].map(v => ({ ...v, activo: true }));
      await cl.from('docentes').upsert(docsArr, { onConflict: 'email' });
    }

    if (asigsMap.size > 0) {
      const asigsArr = [...asigsMap.entries()].map(([clave, nombre]) => ({ clave, nombre }));
      await cl.from('asignaturas').upsert(asigsArr, { onConflict: 'clave' });
    }

    // ─── Resolver IDs para FKs ───
    const emails = [...docentesMap.values()].map(v => v.email).filter(Boolean);
    const claves = [...asigsMap.keys()];
    let emailToId = new Map<string, number>();
    let claveToId = new Map<string, number>();

    if (emails.length > 0) {
      const { data: docsDB } = await cl.from('docentes').select('id,email').in('email', emails);
      for (const d of (docsDB || [])) emailToId.set(d.email, d.id);
    }
    if (claves.length > 0) {
      const { data: asigsDB } = await cl.from('asignaturas').select('id,clave').in('clave', claves);
      for (const a of (asigsDB || [])) claveToId.set(a.clave, a.id);
    }
    console.log('[Importar] EmailToId:', emailToId.size, 'ClaveToId:', claveToId.size);

    // ─── Crear grupos ───
    const gruposArr: any[] = [];
    const grupoToDocAsig = new Map<string, { docente_email: string; clave_asig: string }>();
    for (const r of rows) {
      const grupo_raw = r['Grupo']?.trim() || '';
      const docente_nom = r['Nombre del docente']?.trim() || '';
      const clave = r['Asignatura Clave']?.trim() || '';
      if (!grupo_raw || !docente_nom || !clave) continue;
      const docInfo = docentesMap.get(docente_nom);
      if (!docInfo?.email) continue;
      const key = grupo_raw + '||' + clave;
      if (!grupoToDocAsig.has(key)) {
        grupoToDocAsig.set(key, { docente_email: docInfo.email, clave_asig: clave });
      }
    }

    for (const [key, val] of grupoToDocAsig) {
      const grupo_raw = key.split('||')[0];
      const parts = grupo_raw.split(' - ');
      const grupo_base = parts[0].trim();
      const turno = parts[1]?.trim() || '';
      const modalidad = 'Escolarizado';
      const clave_grupo = grupo_base.replace(/\s+/g, '_').substring(0, 50);
      const docenteId = emailToId.get(val.docente_email);
      const asignaturaId = claveToId.get(val.clave_asig);
      if (!docenteId || !asignaturaId) continue;
      gruposArr.push({ clave: clave_grupo, docente_id: docenteId, asignatura_id: asignaturaId, modalidad, turno_grupo: turno });
    }
    console.log('[Importar] Grupos a crear:', gruposArr.length, 'ejemplo:', JSON.stringify(gruposArr[0]));

    if (gruposArr.length > 0) {
      const { error: gErr } = await cl.from('grupos').insert(gruposArr);
      console.log('[Importar] Grupos insert:', gErr ? gErr.message : 'OK (' + gruposArr.length + ')');
    }

    // ─── Agrupar evaluaciones por docente+asignatura+ciclo (promedios reales) ───
    const gruposEval = new Map<string, any>();
    for (const r of rows) {
      try {
        const docente_nom = r['Nombre del docente']?.trim() || '';
        const clave = r['Asignatura Clave']?.trim() || '';
        const ciclo = (r['Ciclo escolar']?.trim() || '').substring(0, 30);
        if (!docente_nom || !clave) continue;
        const docInfo = docentesMap.get(docente_nom);
        if (!docInfo?.email) continue;
        const key = `${docInfo.email}|${clave}|${ciclo}`;
        if (!gruposEval.has(key)) {
          gruposEval.set(key, { docente_email: docInfo.email, clave, ciclo, t: 0, sAsi:0, sOrg:0, sAct:0, sEns:0, sDom:0, sEva:0, sCom:0, sGes:0, sTec:0, sSat:0, sGen:0, comments: [] as string[] });
        }
        const g = gruposEval.get(key);
        g.t++;
        g.sAsi += parseFloat(r['Asistencia']||'0')||0;
        g.sOrg += parseFloat(r['Organización']||'0')||0;
        g.sAct += parseFloat(r['Actitud']||'0')||0;
        g.sEns += parseFloat(r['Enseñanza']||'0')||0;
        g.sDom += parseFloat(r['Dominio del contenido']||'0')||0;
        g.sEva += parseFloat(r['Evaluación y calificación']||'0')||0;
        g.sCom += parseFloat(r['Participación y comunicación']||'0')||0;
        g.sGes += parseFloat(r['Gestión del grupo']||'0')||0;
        g.sTec += parseFloat(r['Tecnología']||'0')||0;
        g.sSat += parseFloat(r['Satisfacción global del estudiante']||'0')||0;
        g.sGen += parseFloat(r['Promedio']||'0')||0;
        const c = r['Comentarios']?.trim();
        if (c && c !== '.') g.comments.push(c);
      } catch {}
    }
    console.log('[Importar] Grupos de eval:', gruposEval.size);

    const inserts: any[] = [];
    let evaluaciones = 0;
    for (const [, g] of gruposEval) {
      const docenteId = emailToId.get(g.docente_email);
      const asignaturaId = claveToId.get(g.clave);
      if (!docenteId || !asignaturaId) continue;
      const t = g.t;
      inserts.push({
        docente_id: docenteId, asignatura_id: asignaturaId, ciclo: g.ciclo,
        total_respuestas: t,
        prom_asistencia: +(g.sAsi/t).toFixed(2), prom_organizacion: +(g.sOrg/t).toFixed(2),
        prom_actitud: +(g.sAct/t).toFixed(2), prom_ensenanza: +(g.sEns/t).toFixed(2),
        prom_dominio: +(g.sDom/t).toFixed(2), prom_evaluacion: +(g.sEva/t).toFixed(2),
        prom_comunicacion: +(g.sCom/t).toFixed(2), prom_gestion: +(g.sGes/t).toFixed(2),
        prom_tecnologia: +(g.sTec/t).toFixed(2), prom_satisfaccion: +(g.sSat/t).toFixed(2),
        promedio_general: +(g.sGen/t).toFixed(2),
        comentarios: g.comments.length > 0 ? g.comments.join(' | ') : null,
      });
      evaluaciones++;
    }
    for (let i = 0; i < inserts.length; i += 50) {
      const { error } = await cl.from('encuesta_estudiantil').upsert(inserts.slice(i, i+50), { onConflict: 'docente_id,asignatura_id,ciclo' });
      if (error) console.error('[Importar] Upsert error:', error.message);
    }

    return new Response(JSON.stringify({
      success: true, total: rows.length,
      docentes: docentesMap.size, asignaturas: asigsMap.size,
      grupos: gruposSet.size, evaluaciones
    }), { status: 200 });
  } catch (err) {
    console.error('[Importar]', err);
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
