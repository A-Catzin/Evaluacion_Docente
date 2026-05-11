import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  console.log('[SED-360] Middleware ejecutado:', context.url.pathname);
  return next();
});
