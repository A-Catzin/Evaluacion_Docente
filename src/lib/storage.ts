import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let _clienteR2: S3Client | null = null;

export function estaHabilitadoR2(): boolean {
  return import.meta.env.ENABLE_R2 === 'true';
}

function obtenerClienteR2(): S3Client {
  if (_clienteR2) return _clienteR2;

  const accountId = import.meta.env.R2_ACCOUNT_ID as string | undefined;
  const accessKey = import.meta.env.R2_ACCESS_KEY_ID as string | undefined;
  const secretKey = import.meta.env.R2_SECRET_ACCESS_KEY as string | undefined;

  if (!accountId || !accessKey || !secretKey) {
    throw new Error('Faltan variables de entorno R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)');
  }

  _clienteR2 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: true,
  });

  return _clienteR2;
}

function obtenerR2PublicUrl(): string {
  const url = import.meta.env.R2_PUBLIC_URL as string | undefined;
  if (!url) throw new Error('Falta R2_PUBLIC_URL');
  return url.replace(/\/$/, '');
}

export async function subirArchivo(
  bucket: string,
  path: string,
  buffer: ArrayBuffer,
  contentType: string
): Promise<{ url: string }> {
  const cliente = obtenerClienteR2();
  const bucketName = import.meta.env.R2_BUCKET as string | undefined || bucket;

  await cliente.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: path,
      Body: new Uint8Array(buffer),
      ContentType: contentType,
    })
  );

  const publicBase = obtenerR2PublicUrl();
  const url = `${publicBase}/${path}`;

  return { url };
}

export function obtenerUrlPublica(bucket: string, path: string): string {
  const publicBase = obtenerR2PublicUrl();
  return `${publicBase}/${path}`;
}

export async function obtenerUrlFirmada(
  bucket: string,
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const cliente = obtenerClienteR2();
  const bucketName = import.meta.env.R2_BUCKET as string | undefined || bucket;

  return getSignedUrl(
    cliente,
    new GetObjectCommand({ Bucket: bucketName, Key: key }),
    { expiresIn }
  );
}

function extraerRutaDesdeUrl(url: string): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/^\//, '');

    const supabaseMatch = pathname.match(/^storage\/v1\/object\/public\/[^/]+\/(.+)$/);
    if (supabaseMatch) return supabaseMatch[1];

    const r2Match = pathname.match(/^([^/].+)$/);
    if (r2Match) return r2Match[1];

    return null;
  } catch {
    return null;
  }
}

export async function obtenerUrlFirmadaDesdeUrlAlmacenada(
  url: string,
  bucket: string,
  expiresIn: number = 3600
): Promise<string> {
  if (!estaHabilitadoR2()) return url;

  const key = extraerRutaDesdeUrl(url);
  if (!key) return url;

  return obtenerUrlFirmada(bucket, key, expiresIn);
}
