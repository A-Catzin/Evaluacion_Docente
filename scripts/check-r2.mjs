const required = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_PUBLIC_URL',
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing env vars: ${missing.join(', ')}`);
  process.exit(1);
}

if (!process.env.R2_PUBLIC_URL?.startsWith('https://')) {
  console.error('R2_PUBLIC_URL must start with https://');
  process.exit(1);
}

console.log('R2 configuration looks valid.');
