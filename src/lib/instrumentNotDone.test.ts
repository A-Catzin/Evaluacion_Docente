import { describe, expect, it } from 'vitest';
import { isInstrumentClosed } from './instrumentNotDone';

describe('isInstrumentClosed', () => {
  it('closes when the schedule ended', () => {
    expect(isInstrumentClosed({ state: 'scheduled_ended' }, false)).toBe(true);
  });

  it('closes a manually closed window only when the instrument was used in the cycle', () => {
    expect(isInstrumentClosed({ state: 'closed' }, true)).toBe(true);
    expect(isInstrumentClosed({ state: 'closed' }, false)).toBe(false);
  });

  it('never closes an open, pending or unconfigured window', () => {
    for (const state of ['open', 'scheduled_pending', 'not_configured'] as const) {
      expect(isInstrumentClosed({ state }, true)).toBe(false);
    }
  });
});
