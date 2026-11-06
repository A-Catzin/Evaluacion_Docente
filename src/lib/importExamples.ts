import { csvEscape } from './importCsv';

export type ImportColumn = { name: string; required: boolean; description: string };

export type ImportExample = {
  key: 'alumnos' | 'docentes' | 'asignaciones';
  fileName: string;
  columns: ImportColumn[];
  headers: string[];
  rows: string[][];
  notes: string[];
};

// All names, emails and ids below are synthetic; they never match real people.
export const IMPORT_EXAMPLES: Record<ImportExample['key'], ImportExample> = {
  alumnos: {
    key: 'alumnos',
    fileName: 'ejemplo_alumnos.csv',
    columns: [
      { name: 'MATRICULA', required: true, description: 'Matrícula del estudiante.' },
      { name: 'CORREO INSTITUCIONAL', required: true, description: 'Correo del estudiante. También se acepta CORREO o EMAIL.' },
      { name: 'NOMBRE COMPLETO', required: true, description: 'En orden APELLIDO1 APELLIDO2 NOMBRE(S).' },
      { name: 'PLAN DE ESTUDIOS', required: true, description: 'Plan o curso. También se acepta PLAN. Debe venir en cada fila.' },
      { name: 'GRADO', required: true, description: 'Grado o cuatrimestre del estudiante. Debe venir en cada fila.' },
      { name: 'GRUPO', required: true, description: 'Clave del grupo, por ejemplo 27-1 PED 24 08A.' },
      { name: 'ESTADO DE INSCRIPCION', required: false, description: 'Si se incluye, solo se importan las filas INSCRITO, ACTIVO o VIGENTE.' },
      { name: 'CICLO', required: false, description: 'Informativo; el ciclo real es el que se elige en el formulario.' },
    ],
    headers: ['MATRICULA', 'CORREO INSTITUCIONAL', 'NOMBRE COMPLETO', 'PLAN DE ESTUDIOS', 'GRADO', 'GRUPO', 'ESTADO DE INSCRIPCION', 'CICLO'],
    rows: [
      ['TUP0001', 'tup0001@ejemplo.edu.mx', 'PEREZ LOPEZ ANA MARIA', 'PEDAGOGIA', '4', '27-1 PED 24 08A', 'INSCRITO', '27-1'],
      ['TUP0002', 'tup0002@ejemplo.edu.mx', 'GOMEZ RUIZ JUAN CARLOS', 'PEDAGOGIA', '4', '27-1 PED 24 08A', 'INSCRITO', '27-1'],
    ],
    notes: [
      'Elegí primero el ciclo de destino: todas las filas se cargan en ese ciclo.',
      'Cada estudiante aparece una vez por grupo base. Las materias se enlazan después con "Asignar grupos, materias y docentes".',
      'Una misma matrícula con correos distintos (o un correo con matrículas distintas) se marca como ambigua y no se importa.',
    ],
  },
  docentes: {
    key: 'docentes',
    fileName: 'ejemplo_docentes.csv',
    columns: [
      { name: 'NOMBRE COMPLETO', required: true, description: 'En orden NOMBRE(S) APELLIDO PATERNO APELLIDO MATERNO. Alternativa: columnas NOMBRE, APELLIDO PATERNO y APELLIDO MATERNO.' },
      { name: 'CORREO', required: true, description: 'Correo del docente. Obligatorio si no hay NUM EMPLEADO. También se acepta EMAIL o CORREO INSTITUCIONAL.' },
      { name: 'NUM EMPLEADO', required: false, description: 'Número de empleado. Obligatorio si no hay CORREO.' },
    ],
    headers: ['NOMBRE COMPLETO', 'CORREO', 'NUM EMPLEADO'],
    rows: [
      ['ANA MARIA PEREZ LOPEZ', 'docente1@ejemplo.edu.mx', '1001'],
      ['JUAN CARLOS GOMEZ RUIZ', 'docente2@ejemplo.edu.mx', '1002'],
    ],
    notes: [
      'Cada fila necesita al menos un correo o un número de empleado: es la identidad con la que se evita duplicar docentes.',
      'No depende del ciclo: se puede cargar una sola vez y reutilizar.',
      'Una misma identidad repetida en el archivo se importa solo la primera vez.',
    ],
  },
  asignaciones: {
    key: 'asignaciones',
    fileName: 'ejemplo_asignaciones.csv',
    columns: [
      { name: 'Plan de Estudios', required: true, description: 'Debe coincidir con el plan del grupo base importado con los alumnos.' },
      { name: 'Grupo', required: true, description: 'Clave del grupo, por ejemplo 27-1 PED 24 08A. Si trae " - texto" se descarta lo que sigue.' },
      { name: 'Clave', required: true, description: 'Clave de la materia.' },
      { name: 'Clase', required: true, description: 'Nombre de la materia. También se acepta "Nombre de la clase".' },
      { name: 'Docente', required: true, description: 'Nombre completo tal como está en el padrón de docentes.' },
      { name: 'Correo del docente', required: false, description: 'Recomendado: identifica al docente sin depender del nombre.' },
      { name: 'Número de empleado', required: false, description: 'Alternativa al correo para identificar al docente.' },
    ],
    headers: ['Plan de Estudios', 'Grupo', 'Clave', 'Clase', 'Docente', 'Correo del docente', 'Número de empleado'],
    rows: [
      ['PEDAGOGIA', '27-1 PED 24 08A', 'PED401', 'DIDACTICA GENERAL', 'ANA MARIA PEREZ LOPEZ', 'docente1@ejemplo.edu.mx', '1001'],
      ['PEDAGOGIA', '27-1 PED 24 08A', 'PED402', 'EVALUACION EDUCATIVA', 'JUAN CARLOS GOMEZ RUIZ', 'docente2@ejemplo.edu.mx', '1002'],
    ],
    notes: [
      'Importá antes a los docentes y a los alumnos: un docente que no existe o es ambiguo bloquea toda la propuesta.',
      'Primero se genera una vista previa sin cambiar datos; solo después se confirma.',
      'Si el nombre del docente no coincide exactamente con el padrón, incluí su correo o su número de empleado.',
    ],
  },
};

export function exampleCsv(example: ImportExample): string {
  const lines = [example.headers, ...example.rows].map((row) => row.map(csvEscape).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}
