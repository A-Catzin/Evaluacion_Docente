import { timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Without a configured
 * secret the endpoint must stay closed, so an empty secret never authorizes.
 */
export function isAuthorizedCron(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
