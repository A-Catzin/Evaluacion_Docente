import { describe, expect, it } from 'vitest';
import { EstudianteEvaluacionSchema } from './apiSchemas';

describe('EstudianteEvaluacionSchema', () => {
  it('accepts exactly nineteen integer answers from one through five', () => {
    expect(EstudianteEvaluacionSchema.safeParse({ grupo_id: 1, respuestas: Array.from({ length: 19 }, () => 5) }).success).toBe(true);
  });

  it('rejects legacy scale values and incomplete answers', () => {
    expect(EstudianteEvaluacionSchema.safeParse({ grupo_id: 1, respuestas: [6, ...Array.from({ length: 18 }, () => 5)] }).success).toBe(false);
    expect(EstudianteEvaluacionSchema.safeParse({ grupo_id: 1, respuestas: Array.from({ length: 18 }, () => 5) }).success).toBe(false);
  });
});
