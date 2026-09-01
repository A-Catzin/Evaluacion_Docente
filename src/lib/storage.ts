import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let _clienteR2: S3Client | null = null;

type R2Environment = Record<string, string | undefined>;

export type R2DiagnosticCode =
  | 'r2_config_missing'
  | 'r2_public_url_invalid'
  | 'r2_list_ok'
  | 'r2_access_denied'
  | 'r2_bucket_not_found'
  | 'r2_connection_failed';

export type R2ConfigurationStatus = {
  enabled: boolean;
  accountIdPresent: boolean;
  accessKeyPresent: boolean;
  secretAccessKeyPresent: boolean;
  bucketPresent: boolean;
  publicUrlPresent: boolean;
  publicUrlHttps: boolean;
};

function environment(): R2Environment {
  // Vercel Node functions provide server-only variables at runtime through process.env.
  return process.env as R2Environment;
}

function hasValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function isHttpsUrl(value: string | undefined): boolean {
  if (!hasValue(value)) return false;
  try {
    const url = new URL(value!);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function r2ConfigurationStatus(
  values: R2Environment = environment(),
): R2ConfigurationStatus {
  const accountIdPresent = hasValue(values.R2_ACCOUNT_ID);
  const accessKeyPresent = hasValue(values.R2_ACCESS_KEY_ID);
  const secretAccessKeyPresent = hasValue(values.R2_SECRET_ACCESS_KEY);
  const bucketPresent = hasValue(values.R2_BUCKET);
  const publicUrlPresent = hasValue(values.R2_PUBLIC_URL);
  const publicUrlHttps = isHttpsUrl(values.R2_PUBLIC_URL);

  return {
    enabled: accountIdPresent && accessKeyPresent && secretAccessKeyPresent && bucketPresent && publicUrlHttps,
    accountIdPresent,
    accessKeyPresent,
    secretAccessKeyPresent,
    bucketPresent,
    publicUrlPresent,
    publicUrlHttps,
  };
}

export function r2ConfigurationDiagnosticCode(
  configuration: R2ConfigurationStatus,
): Extract<R2DiagnosticCode, 'r2_config_missing' | 'r2_public_url_invalid'> | null {
  if (!configuration.accountIdPresent || !configuration.accessKeyPresent || !configuration.secretAccessKeyPresent || !configuration.bucketPresent || !configuration.publicUrlPresent) {
    return 'r2_config_missing';
  }
  if (!configuration.publicUrlHttps) return 'r2_public_url_invalid';
  return null;
}

function requireR2Configuration(): R2Environment {
  if (r2ConfigurationDiagnosticCode(r2ConfigurationStatus())) {
    throw new Error('La configuración de R2 no está disponible');
  }
  return environment();
}

function r2ErrorCode(error: unknown): Exclude<R2DiagnosticCode, 'r2_config_missing' | 'r2_public_url_invalid' | 'r2_list_ok'> {
  const value = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  const status = value?.$metadata?.httpStatusCode;
  if (status === 401 || status === 403 || value?.name === 'AccessDenied') return 'r2_access_denied';
  if (status === 404 || value?.name === 'NoSuchBucket') return 'r2_bucket_not_found';
  return 'r2_connection_failed';
}

export function r2UploadErrorCode(error: unknown): R2DiagnosticCode {
  return r2ErrorCode(error);
}

export async function diagnosticarR2(): Promise<{
  configuration: R2ConfigurationStatus;
  code: R2DiagnosticCode;
}> {
  const configuration = r2ConfigurationStatus();
  const configurationCode = r2ConfigurationDiagnosticCode(configuration);
  if (configurationCode) return { configuration, code: configurationCode };

  try {
    await obtenerClienteR2().send(
      new ListObjectsV2Command({
        Bucket: environment().R2_BUCKET,
        MaxKeys: 0,
      }),
    );
    return { configuration, code: 'r2_list_ok' };
  } catch (error) {
    return { configuration, code: r2ErrorCode(error) };
  }
}

export function estaHabilitadoR2(): boolean {
  return r2ConfigurationStatus().enabled;
}

function obtenerClienteR2(): S3Client {
  if (_clienteR2) return _clienteR2;

  const values = requireR2Configuration();
  const accountId = values.R2_ACCOUNT_ID;
  const accessKey = values.R2_ACCESS_KEY_ID;
  const secretKey = values.R2_SECRET_ACCESS_KEY;

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

export function obtenerR2PublicUrl(): string {
  const url = requireR2Configuration().R2_PUBLIC_URL;
  return url!.replace(/\/$/, '');
}

export async function subirArchivo(
  path: string,
  buffer: ArrayBuffer,
  contentType: string
): Promise<{ url: string }> {
  // Validate the public reference before creating an object to avoid orphaned uploads.
  const publicBase = obtenerR2PublicUrl();
  const cliente = obtenerClienteR2();
  const bucketName = requireR2Configuration().R2_BUCKET!;

  await cliente.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: path,
      Body: new Uint8Array(buffer),
      ContentType: contentType,
    })
  );

  const url = `${publicBase}/${path}`;

  return { url };
}

export function obtenerUrlPublica(path: string): string {
  const publicBase = obtenerR2PublicUrl();
  return `${publicBase}/${path}`;
}

export async function obtenerUrlFirmada(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const cliente = obtenerClienteR2();
  const bucketName = requireR2Configuration().R2_BUCKET!;

  return getSignedUrl(
    cliente,
    new GetObjectCommand({ Bucket: bucketName, Key: key }),
    { expiresIn }
  );
}

export async function eliminarArchivo(key: string): Promise<void> {
  const cliente = obtenerClienteR2();
  const bucketName = requireR2Configuration().R2_BUCKET!;
  await cliente.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
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
  expiresIn: number = 3600
): Promise<string> {
  if (!estaHabilitadoR2()) return url;

  const key = extraerRutaDesdeUrl(url);
  if (!key) return url;

  return obtenerUrlFirmada(key, expiresIn);
}
