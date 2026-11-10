import { describe, expect, it } from 'vitest';
import { isAuthorizedCron } from './cronAuth';

const secret = 'a-long-enough-secret-value';

describe('isAuthorizedCron', () => {
  it('accepts the exact bearer secret', () => {
    expect(isAuthorizedCron(`Bearer ${secret}`, secret)).toBe(true);
  });

  it('rejects a missing, wrong or malformed header', () => {
    expect(isAuthorizedCron(null, secret)).toBe(false);
    expect(isAuthorizedCron('Bearer other-secret-value-xx', secret)).toBe(false);
    expect(isAuthorizedCron(secret, secret)).toBe(false);
  });

  it('stays closed when the secret is not configured or too short', () => {
    expect(isAuthorizedCron('Bearer ', '')).toBe(false);
    expect(isAuthorizedCron('Bearer undefined', undefined)).toBe(false);
    expect(isAuthorizedCron('Bearer short', 'short')).toBe(false);
  });
});
