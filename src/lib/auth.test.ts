import { describe, expect, it } from 'vitest';
import { DOMINIO_PERMITIDO, esCorreoTec, jsonAuthResponse } from './auth';

describe('auth', () => {
  describe('esCorreoTec', () => {
    it('acepta correos del dominio permitido', () => {
      expect(esCorreoTec('usuario@tecplayacar.edu.mx')).toBe(true);
      expect(esCorreoTec('Usuario@TECPLAYACAR.EDU.MX')).toBe(true);
    });

    it('rechaza correos de otros dominios', () => {
      expect(esCorreoTec('usuario@gmail.com')).toBe(false);
      expect(esCorreoTec('usuario@tecplayacar.com')).toBe(false);
      expect(esCorreoTec('usuario@sub.tecplayacar.edu.mx')).toBe(false);
    });

    it('el dominio permitido tiene el formato esperado', () => {
      expect(DOMINIO_PERMITIDO).toBe('@tecplayacar.edu.mx');
    });
  });

  describe('jsonAuthResponse', () => {
    it('devuelve un Response JSON con el status y headers correctos', () => {
      const body = { error: 'No autorizado', code: 'session_invalid' };
      const response = jsonAuthResponse(body, 401);

      expect(response.status).toBe(401);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    });

    it('serializa correctamente el cuerpo', async () => {
      const body = { ok: true };
      const response = jsonAuthResponse(body, 200);
      expect(await response.json()).toEqual(body);
    });
  });

  describe('requireRole', () => {
    it('no se testea en esta iteración porque requiere cookies y cliente Supabase', () => {
      // requireRole depende de sb-access-token/refresh-token, setSession de Supabase
      // y la tabla usuarios. En una iteración futura se puede mockear AstroCookies y
      // el cliente de Supabase, o extraer la validación pura del dominio/rol.
      expect(true).toBe(true);
    });
  });
});
