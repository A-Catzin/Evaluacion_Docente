const required = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
];

const present = (name) => Boolean(process.env[name]?.trim());
const publicUrlHttps = (() => {
  if (!present("R2_PUBLIC_URL")) return false;
  try {
    const url = new URL(process.env.R2_PUBLIC_URL);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
})();
const status = {
  accountIdPresent: present("R2_ACCOUNT_ID"),
  accessKeyPresent: present("R2_ACCESS_KEY_ID"),
  secretAccessKeyPresent: present("R2_SECRET_ACCESS_KEY"),
  bucketPresent: present("R2_BUCKET"),
  publicUrlPresent: present("R2_PUBLIC_URL"),
  publicUrlHttps,
};
status.enabled = required.every(present) && publicUrlHttps;

console.log(JSON.stringify({ r2Configuration: status }));

const diagnosticCode = required.some((name) => !present(name))
  ? "r2_config_missing"
  : !publicUrlHttps
    ? "r2_public_url_invalid"
    : "r2_configuration_valid";

if (diagnosticCode !== "r2_configuration_valid") {
  console.error(`R2 diagnostic code: ${diagnosticCode}`);
  process.exit(1);
}

console.log("R2 diagnostic code: r2_configuration_valid");
