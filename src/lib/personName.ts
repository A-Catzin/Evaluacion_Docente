export function formatPersonName(value: string | null | undefined): string {
  return value?.toLocaleUpperCase("es-MX") || "";
}
