import { describe, expect, it } from 'vitest';
import { validateNoticeImage } from './noticeImages';

function image(name: string, type: string, size = 2): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('notice image validation', () => {
  it('accepts supported MIME types with matching extensions', () => {
    expect(validateNoticeImage(image('banner.png', 'image/png'))).toEqual({ ok: true, extension: 'png' });
  });

  it('rejects extension and MIME mismatches', () => {
    expect(validateNoticeImage(image('banner.png', 'image/jpeg'))).toMatchObject({ ok: false });
  });

  it('rejects images larger than five megabytes', () => {
    expect(validateNoticeImage(image('banner.webp', 'image/webp', 5 * 1024 * 1024 + 1))).toMatchObject({ ok: false });
  });
});
