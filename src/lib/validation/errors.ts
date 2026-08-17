import type { ZodError } from 'zod';

export function formatZodFieldErrors(error: ZodError): Record<string, string[] | undefined> {
  return error.flatten().fieldErrors;
}
