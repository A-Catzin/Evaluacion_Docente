const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MAX_NOTICE_IMAGE_BYTES = 5 * 1024 * 1024;

export type NoticeImageValidation =
  | { ok: true; extension: string }
  | { ok: false; error: string };

export function validateNoticeImage(file: File): NoticeImageValidation {
  if (file.size <= 0 || file.size > MAX_NOTICE_IMAGE_BYTES) {
    return { ok: false, error: 'La imagen debe pesar máximo 5 MB.' };
  }
  const extension = file.name.split('.').pop()?.toLowerCase();
  const expectedExtension = IMAGE_TYPES[file.type];
  if (!expectedExtension || !extension || !['jpg', 'jpeg', 'png', 'webp'].includes(extension)) {
    return { ok: false, error: 'Solo se aceptan imágenes JPG, PNG o WebP.' };
  }
  if ((expectedExtension === 'jpg' && !['jpg', 'jpeg'].includes(extension)) || (expectedExtension !== 'jpg' && extension !== expectedExtension)) {
    return { ok: false, error: 'La extensión no coincide con el tipo de imagen.' };
  }
  return { ok: true, extension: expectedExtension };
}
