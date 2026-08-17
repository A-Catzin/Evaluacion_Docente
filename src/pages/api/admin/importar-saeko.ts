import type { APIRoute } from 'astro';

const response = () => new Response(
  JSON.stringify({
    error: 'La importación de evaluaciones Saeko fue retirada. Las evaluaciones estudiantiles se califican únicamente con respuestas nativas.',
    code: 'SAEKO_IMPORT_RETIRED',
  }),
  { status: 410, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
);

export const GET: APIRoute = response;
export const POST: APIRoute = response;
