import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';

type RosterRow = {
  rowNumber: number;
  ciclo: string;
  nombre: string;
  apellidos: string;
  matricula: string;
  email: string;
  plan: string;
  grado: string;
  grupo: string;
  estado: string;
};

type Diagnostic = { row: number; reason: string; matricula?: string; grupo?: string; ciclo?: string };

type GroupBucket = {
  key: string;
  plan: string;
  grado: string;
  grupo: string;
  rows: RosterRow[];
  studentIds: Set<number>;
};

const BATCH_SIZE = 100;
const MAX_DIAGNOSTICS = 250;
const GROUP_FIELDS = 'id,clave,cuatrimestre_id,asignatura_id,docente_id,num_alumnos,plan_normalizado,grado,grupo_normalizado';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function normalize(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKey(value: string): string {
  return normalize(value).replace(/[^A-Z0-9]+/g, '');
}

function normalizeGroup(value: string | null | undefined): string {
  return normalize(value).replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += char === '\r' && text[i + 1] === '\n' ? '' : char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      record.push(field.trim()); field = '';
    } else if (char === '\n') {
      record.push(field.trim()); field = '';
      if (record.some(Boolean)) records.push(record);
      record = [];
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field || record.length) {
    record.push(field.trim());
    if (record.some(Boolean)) records.push(record);
  }
  return records;
}

function findColumn(headers: string[], ...names: string[]): number {
  const normalized = headers.map(normalizeKey);
  for (const name of names) {
    const index = normalized.indexOf(normalizeKey(name));
    if (index >= 0) return index;
  }
  return -1;
}

function addDiagnostic(diagnostics: Diagnostic[], item: Diagnostic) {
  if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push(item);
}

function chunks<T>(items: T[], size = BATCH_SIZE): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

function splitName(fullName: string): { nombre: string; apellidos: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { nombre: parts[0] || '', apellidos: '' };
  return { nombre: parts.slice(2).join(' ') || parts[0], apellidos: parts.length > 2 ? parts.slice(0, 2).join(' ') : parts[0] };
}

function exactGroupMatch(group: any, bucket: GroupBucket): boolean {
  return normalizeGroup(group.grupo_normalizado || group.clave) === bucket.grupo
    && normalize(group.plan_normalizado) === bucket.plan
    && normalize(group.grado) === bucket.grado;
}

function legacyGroupMatch(group: any, bucket: GroupBucket): boolean {
  return normalizeGroup(group.grupo_normalizado || group.clave) === bucket.grupo
    && (!group.plan_normalizado || normalize(group.plan_normalizado) === bucket.plan)
    && (!group.grado || normalize(group.grado) === bucket.grado);
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const accessToken = cookies.get('sb-access-token')?.value;
  const refreshToken = cookies.get('sb-refresh-token')?.value;
  if (!accessToken || !refreshToken) return json({ error: 'No autorizado' }, 401);

  try {
    const client = db();
    const { data: session } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (!session.user) return json({ error: 'Sesión inválida' }, 401);
    const { data: user } = await client.from('usuarios').select('rol').eq('id', session.user.id).maybeSingle();
    if (!user || user.rol !== 'superadmin') return json({ error: 'Solo superadmin' }, 403);

    const formData = await request.formData();
    const file = formData.get('file');
    const cycleId = Number(formData.get('cuatrimestre_id'));
    if (!(file instanceof File)) return json({ error: 'Archivo requerido' }, 400);
    if (!Number.isInteger(cycleId) || cycleId < 1) return json({ error: 'Selecciona un ciclo válido desde la aplicación' }, 400);
    if (file.size > 25 * 1024 * 1024) return json({ error: 'El archivo no debe superar 25 MB' }, 400);

    const { data: cycle, error: cycleError } = await client.from('cuatrimestres').select('id,clave,nombre').eq('id', cycleId).maybeSingle();
    if (cycleError || !cycle) return json({ error: 'El ciclo seleccionado no existe' }, 400);

    const records = parseCsv((await file.text()).replace(/^\uFEFF/, ''));
    if (records.length < 2) return json({ error: 'CSV vacío o sin filas de datos' }, 400);
    const headers = records[0];
    const columns = {
      ciclo: findColumn(headers, 'CICLO'),
      fullName: findColumn(headers, 'NOMBRE COMPLETO'),
      nombre: findColumn(headers, 'NOMBRE'),
      firstLastName: findColumn(headers, 'PRIMER APELLIDO'),
      secondLastName: findColumn(headers, 'SEGUNDO APELLIDO'),
      matricula: findColumn(headers, 'MATRICULA', 'MATRÍCULA'),
      email: findColumn(headers, 'CORREO INSTITUCIONAL', 'CORREO', 'EMAIL'),
      plan: findColumn(headers, 'PLAN DE ESTUDIOS O CURSO', 'PLAN DE ESTUDIOS', 'PLAN'),
      grado: findColumn(headers, 'GRADO'),
      grupo: findColumn(headers, 'GRUPO'),
      estado: findColumn(headers, 'ESTADO DE INSCRIPCION', 'ESTADO DE INSCRIPCIÓN', 'ESTADO'),
    };
    if (columns.matricula < 0 || columns.email < 0 || columns.grupo < 0) {
      return json({ error: 'El CSV debe incluir MATRICULA, CORREO INSTITUCIONAL y GRUPO' }, 400);
    }
    if (columns.fullName < 0) {
      return json({ error: 'El CSV debe incluir NOMBRE COMPLETO' }, 400);
    }

    const diagnostics: Diagnostic[] = [];
    let skipped = 0;
    let ambiguous = 0;
    let errors = 0;
    const cycleValues = new Map<string, number>();
    const validRows: RosterRow[] = [];

    for (let index = 1; index < records.length; index++) {
      const values = records[index];
      const value = (column: number) => column >= 0 ? values[column] || '' : '';
      const ciclo = value(columns.ciclo);
      if (ciclo) cycleValues.set(ciclo, (cycleValues.get(ciclo) || 0) + 1);
      const fullName = value(columns.fullName);
      const parsedName = splitName(fullName);
      const nombre = parsedName.nombre;
      const apellidos = parsedName.apellidos;
      const row: RosterRow = { rowNumber: index + 1, ciclo, nombre, apellidos, matricula: value(columns.matricula), email: value(columns.email).toLowerCase(), plan: value(columns.plan), grado: value(columns.grado), grupo: value(columns.grupo), estado: value(columns.estado) };
      const status = normalize(row.estado);
      if (status && !['INSCRITO', 'ACTIVO', 'VIGENTE'].includes(status)) {
        skipped++; addDiagnostic(diagnostics, { row: row.rowNumber, reason: 'estado_no_inscrito', matricula: row.matricula, grupo: row.grupo }); continue;
      }
      if (!row.matricula || !row.email || !row.nombre || !row.apellidos || !normalize(row.plan) || !normalize(row.grado) || !normalizeGroup(row.grupo)) {
        errors++; addDiagnostic(diagnostics, { row: row.rowNumber, reason: 'identidad_incompleta', matricula: row.matricula, grupo: row.grupo }); continue;
      }
      if (normalize(row.plan).length > 150 || normalizeGroup(row.grupo).length > 150 || normalize(row.grado).length > 30) {
        errors++; addDiagnostic(diagnostics, { row: row.rowNumber, reason: 'identidad_fuera_de_rango', matricula: row.matricula, grupo: row.grupo }); continue;
      }
      validRows.push(row);
    }

    const { data: existingStudents, error: studentsError } = await client.from('estudiantes').select('id,nombre,apellidos,email,matricula,activo');
    if (studentsError) return json({ error: `No se pudo leer estudiantes: ${studentsError.message}` }, 500);
    const byMatricula = new Map<string, any>();
    const byEmail = new Map<string, any>();
    for (const student of existingStudents || []) {
      byMatricula.set(normalize(student.matricula), student);
      byEmail.set(normalize(student.email), student);
    }

    const identityRows = new Map<string, RosterRow[]>();
    for (const row of validRows) {
      const key = normalize(row.matricula);
      if (!identityRows.has(key)) identityRows.set(key, []);
      identityRows.get(key)!.push(row);
    }

    const studentIdByKey = new Map<string, number>();
    const existingPayloads: any[] = [];
    const newPayloads: any[] = [];
    let studentsMatched = 0;
    let studentsCreated = 0;
    let studentsUpdated = 0;

    for (const [key, rows] of identityRows) {
      const first = rows[0];
      const emails = new Set(rows.map(row => normalize(row.email)));
      if (emails.size > 1) {
        ambiguous += rows.length; rows.forEach(row => addDiagnostic(diagnostics, { row: row.rowNumber, reason: 'identidad_ambigua', matricula: row.matricula, grupo: row.grupo }));
        continue;
      }
      const byMat = byMatricula.get(normalize(first.matricula));
      const byMail = byEmail.get(normalize(first.email));
      if (byMat && byMail && byMat.id !== byMail.id) {
        ambiguous += rows.length; rows.forEach(row => addDiagnostic(diagnostics, { row: row.rowNumber, reason: 'identidad_ambigua', matricula: row.matricula, grupo: row.grupo }));
        continue;
      }
      const current = byMat || byMail;
      const payload = { nombre: first.nombre, apellidos: first.apellidos, email: first.email, matricula: first.matricula, activo: true };
      if (current) {
        studentsMatched++;
        studentIdByKey.set(key, current.id);
        if (current.nombre !== payload.nombre || current.apellidos !== payload.apellidos || normalize(current.email) !== normalize(payload.email) || normalize(current.matricula) !== normalize(payload.matricula) || !current.activo) existingPayloads.push({ id: current.id, ...payload });
      } else {
        newPayloads.push(payload);
      }
    }

    for (const batch of chunks(existingPayloads)) {
      for (const item of batch) {
        const { error } = await client.from('estudiantes').update(item).eq('id', item.id);
        if (error) {
          errors++; addDiagnostic(diagnostics, { row: identityRows.get(normalize(item.matricula))?.[0].rowNumber || 0, reason: 'estudiante_no_guardado', matricula: item.matricula });
        } else studentsUpdated++;
      }
    }
    for (const batch of chunks(newPayloads)) {
      const { data, error } = await client.from('estudiantes').insert(batch).select('id,matricula,email');
      if (!error && data) {
        studentsCreated += data.length;
        for (const student of data) studentIdByKey.set(normalize(student.matricula), student.id);
      } else {
        for (const item of batch) {
          const result = await client.from('estudiantes').insert(item).select('id,matricula,email').maybeSingle();
          if (result.error || !result.data) {
            errors++; addDiagnostic(diagnostics, { row: identityRows.get(normalize(item.matricula))?.[0].rowNumber || 0, reason: 'estudiante_no_guardado', matricula: item.matricula });
          } else {
            studentsCreated++; studentIdByKey.set(normalize(item.matricula), result.data.id);
          }
        }
      }
    }

    const { data: groups, error: groupsError } = await client.from('grupos').select(GROUP_FIELDS).eq('cuatrimestre_id', cycleId);
    if (groupsError) return json({ error: `No se pudo leer grupos del ciclo. Aplica la migración 030_importacion_alumnos_ciclo.sql: ${groupsError.message}` }, 500);

    const groupBuckets = new Map<string, GroupBucket>();
    for (const row of validRows) {
      const studentId = studentIdByKey.get(normalize(row.matricula));
      if (!studentId) {
        errors++; skipped++; addDiagnostic(diagnostics, { row: row.rowNumber, reason: 'estudiante_no_guardado', matricula: row.matricula, grupo: row.grupo }); continue;
      }
      const plan = normalize(row.plan);
      const grado = normalize(row.grado);
      const grupo = normalizeGroup(row.grupo);
      const key = `${plan}|${grado}|${grupo}`;
      let bucket = groupBuckets.get(key);
      if (!bucket) {
        bucket = { key, plan, grado, grupo, rows: [], studentIds: new Set<number>() };
        groupBuckets.set(key, bucket);
      }
      bucket.rows.push(row);
      bucket.studentIds.add(studentId);
    }

    const bucketKeysByGroup = new Map<string, Set<string>>();
    for (const bucket of groupBuckets.values()) {
      if (!bucketKeysByGroup.has(bucket.grupo)) bucketKeysByGroup.set(bucket.grupo, new Set());
      bucketKeysByGroup.get(bucket.grupo)!.add(bucket.key);
    }
    const legacyUnsafeIds = new Set<number>();
    for (const group of groups || []) {
      const groupNorm = normalizeGroup(group.grupo_normalizado || group.clave);
      if ((!group.plan_normalizado || !group.grado) && (bucketKeysByGroup.get(groupNorm)?.size || 0) > 1) legacyUnsafeIds.add(group.id);
    }

    let groupsMatched = 0;
    let groupsCreated = 0;
    let groupsUpdated = 0;
    const resolvedGroups = new Map<string, any>();
    const groupUpdates = new Map<number, any>();

    for (const bucket of groupBuckets.values()) {
      const exactCandidates = (groups || []).filter(group => exactGroupMatch(group, bucket));
      if (exactCandidates.length > 1) {
        ambiguous += bucket.rows.length;
        bucket.rows.forEach(row => addDiagnostic(diagnostics, { row: row.rowNumber, reason: 'grupo_ambiguo', matricula: row.matricula, grupo: row.grupo }));
      }
      let group = exactCandidates.sort((a, b) => a.id - b.id)[0];
      if (!group) {
        const legacyCandidates = (groups || []).filter(candidate => legacyGroupMatch(candidate, bucket) && !legacyUnsafeIds.has(candidate.id));
        if (legacyCandidates.length === 1) group = legacyCandidates[0];
        else if (legacyCandidates.length > 1) {
          ambiguous += bucket.rows.length;
          bucket.rows.forEach(row => addDiagnostic(diagnostics, { row: row.rowNumber, reason: 'grupo_ambiguo', matricula: row.matricula, grupo: row.grupo }));
        }
      }

      if (group) {
        groupsMatched++;
      } else {
        const payload = {
          clave: bucket.grupo.slice(0, 20),
          cuatrimestre_id: cycleId,
          docente_id: null,
          asignatura_id: null,
          plan_normalizado: bucket.plan,
          grado: bucket.grado,
          grupo_normalizado: bucket.grupo,
          num_alumnos: bucket.studentIds.size,
          activo: true,
        };
        const inserted = await client.from('grupos').insert(payload).select(GROUP_FIELDS).maybeSingle();
        if (!inserted.error && inserted.data) {
          group = inserted.data;
          groupsCreated++;
          (groups || []).push(group);
        } else {
          // Re-read the exact identity so a repeated/concurrent import can reuse a row created meanwhile.
          const retry = await client.from('grupos').select(GROUP_FIELDS).eq('cuatrimestre_id', cycleId).eq('plan_normalizado', bucket.plan).eq('grado', bucket.grado).eq('grupo_normalizado', bucket.grupo);
          if (!retry.error && retry.data?.length) {
            group = retry.data.sort((a, b) => a.id - b.id)[0];
            groupsMatched++;
          } else {
            errors += bucket.rows.length;
            skipped += bucket.rows.length;
            bucket.rows.forEach(row => addDiagnostic(diagnostics, { row: row.rowNumber, reason: 'grupo_no_guardado', matricula: row.matricula, grupo: row.grupo }));
            continue;
          }
        }
      }

      resolvedGroups.set(bucket.key, group);
      const next = { id: group.id, plan_normalizado: bucket.plan, grado: bucket.grado, grupo_normalizado: bucket.grupo, num_alumnos: bucket.studentIds.size };
      if (next.plan_normalizado !== group.plan_normalizado || next.grado !== group.grado || next.grupo_normalizado !== group.grupo_normalizado || next.num_alumnos !== group.num_alumnos) groupUpdates.set(group.id, next);
    }

    for (const batch of chunks([...groupUpdates.values()])) {
      const { error } = await client.from('grupos').upsert(batch, { onConflict: 'id' });
      if (!error) {
        groupsUpdated += batch.length;
      } else {
        for (const item of batch) {
          const result = await client.from('grupos').update(item).eq('id', item.id);
          if (result.error) {
            errors++;
            const bucket = [...groupBuckets.values()].find(candidate => resolvedGroups.get(candidate.key)?.id === item.id);
            addDiagnostic(diagnostics, { row: bucket?.rows[0].rowNumber || 0, reason: 'grupo_no_guardado', grupo: bucket?.grupo });
          } else groupsUpdated++;
        }
      }
    }

    const inscriptions = new Map<string, any>();
    for (const bucket of groupBuckets.values()) {
      const group = resolvedGroups.get(bucket.key);
      if (!group) continue;
      for (const studentId of bucket.studentIds) {
        const key = `${studentId}|${group.id}|${cycleId}`;
        inscriptions.set(key, { estudiante_id: studentId, grupo_id: group.id, cuatrimestre_id: cycleId });
      }
    }

    let inscriptionsUpserted = 0;
    for (const batch of chunks([...inscriptions.values()])) {
      const { error } = await client.from('inscripciones').upsert(batch, { onConflict: 'estudiante_id,grupo_id,cuatrimestre_id' });
      if (!error) {
        inscriptionsUpserted += batch.length;
      } else {
        for (const item of batch) {
          const result = await client.from('inscripciones').upsert(item, { onConflict: 'estudiante_id,grupo_id,cuatrimestre_id' });
          if (result.error) {
            errors++; addDiagnostic(diagnostics, { row: 0, reason: 'inscripcion_no_guardada', matricula: String(item.estudiante_id), grupo: String(item.grupo_id) });
          } else inscriptionsUpserted++;
        }
      }
    }

    return json({
      success: true,
      cycle: { id: cycle.id, clave: cycle.clave },
      rowsRead: records.length - 1,
      studentsMatched,
      studentsCreated,
      studentsUpdated,
      groupsMatched,
      groupsCreated,
      groupsUpdated,
      inscriptionsUpserted,
      skipped,
      ambiguous,
      errors,
      cycleValues: [...cycleValues.entries()].map(([value, count]) => ({ value, count })),
      diagnostics,
    });
  } catch (error) {
    console.error('[Importar alumnos]', error);
    return json({ error: 'Error interno al procesar el padrón' }, 500);
  }
};
