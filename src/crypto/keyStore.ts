/**
 * Encrypted Key Storage
 *
 * Encrypts EdDSA private keys before storing in localStorage.
 * Uses Web Crypto API (AES-GCM) with wallet-address-derived key.
 *
 * Not a substitute for proper key management in production —
 * but prevents plain-text exposure in browser DevTools.
 *
 * Migration: reads plain-text keys from old format gracefully.
 */

const SALT = new Uint8Array([
  0x7a, 0x6b, 0x2d, 0x64, 0x65, 0x78, 0x2d, 0x6d,
  0x61, 0x63, 0x69, 0x2d, 0x6b, 0x65, 0x79, 0x73,
]) // "zk-dex-maci-keys"

const ENC_PREFIX = 'enc:'

async function deriveKey(address: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(address.toLowerCase()),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: SALT, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function storeEncrypted(
  storageKey: string,
  value: string,
  address: string,
): Promise<void> {
  const cryptoKey = await deriveKey(address)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(value)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encoded,
  )
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)
  const b64 = btoa(String.fromCharCode(...combined))
  localStorage.setItem(storageKey, ENC_PREFIX + b64)
}

export async function loadEncrypted(
  storageKey: string,
  address: string,
): Promise<string | null> {
  const stored = localStorage.getItem(storageKey)
  if (!stored) return null

  // Encrypted format: "enc:<base64>"
  if (stored.startsWith(ENC_PREFIX)) {
    try {
      const b64 = stored.slice(ENC_PREFIX.length)
      const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const iv = combined.slice(0, 12)
      const data = combined.slice(12)
      const cryptoKey = await deriveKey(address)
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        data,
      )
      return new TextDecoder().decode(decrypted)
    } catch {
      return null
    }
  }

  // Migration: plain-text from old format — re-encrypt and return
  await storeEncrypted(storageKey, stored, address)
  return stored
}
