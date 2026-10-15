export type StudentComment = {
  docenteId: number;
  grupoId: number;
  docente: string;
  grupo: string;
  comentario: string;
};

export type TeacherComments = {
  docenteId: number;
  docente: string;
  groups: { grupoId: number; grupo: string; comments: string[] }[];
};

/** Group only within the current page; never merge equal display names. */
export function groupComments(rows: StudentComment[]): TeacherComments[] {
  const teachers = new Map<number, TeacherComments>();
  const groups = new Map<number, Map<number, TeacherComments['groups'][number]>>();
  for (const row of rows) {
    let teacher = teachers.get(row.docenteId);
    if (!teacher) {
      teacher = { docenteId: row.docenteId, docente: row.docente, groups: [] };
      teachers.set(row.docenteId, teacher);
      groups.set(row.docenteId, new Map());
    }
    const teacherGroups = groups.get(row.docenteId)!;
    let group = teacherGroups.get(row.grupoId);
    if (!group) {
      group = { grupoId: row.grupoId, grupo: row.grupo, comments: [] };
      teacherGroups.set(row.grupoId, group);
      teacher.groups.push(group);
    }
    group.comments.push(row.comentario);
  }
  return [...teachers.values()];
}
