// Public labels and routes for the four draft observation formats. Codes are internal RPC identifiers.
export const newObservationFormats = [
  { slug: 'campos-clinicos', code: 'observation_supervision_clinical', title: 'Campos clínicos' },
  { slug: 'practica-profesional', code: 'observation_professional_practice', title: 'Práctica Profesional' },
  { slug: 'simulacion-clinica', code: 'observation_simulation', title: 'Simulación clínica' },
  { slug: 'cultura-y-deporte', code: 'observation_teaching_competencies', title: 'Cultura y Deporte' },
] as const;

export function getNewObservationFormat(slug: string | undefined) {
  return newObservationFormats.find(format => format.slug === slug) ?? null;
}
