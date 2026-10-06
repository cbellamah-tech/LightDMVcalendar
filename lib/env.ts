/** Read an env var by name, or by the same name behind a custom prefix (Vercel integrations allow e.g. STORAGE_POSTGRES_URL). */
export function envAny(...names: string[]): string | undefined {
  for (const n of names) if (process.env[n]?.trim()) return process.env[n]!.trim();
  for (const n of names) {
    const k = Object.keys(process.env).find((key) => key.endsWith(`_${n}`) && process.env[key]?.trim());
    if (k) return process.env[k]!.trim();
  }
  return undefined;
}
