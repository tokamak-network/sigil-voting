/**
 * Runtime check: ensure no private keys leak into NEXT_PUBLIC_* env vars.
 * Call this early in the app lifecycle (e.g., layout or provider).
 */
export function assertNoSecretExposure(): void {
  const dangerous = ['PRIVATE_KEY', 'COORDINATOR_PRIVATE_KEY', 'SECRET', 'API_KEY']

  for (const key of Object.keys(process.env)) {
    if (!key.startsWith('NEXT_PUBLIC_')) continue
    const upper = key.toUpperCase()
    for (const d of dangerous) {
      if (upper.includes(d)) {
        throw new Error(
          `SECURITY: Secret "${key}" exposed as NEXT_PUBLIC_ env var. ` +
            'Remove it from the client bundle immediately.'
        )
      }
    }
  }
}
