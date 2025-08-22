import crypto from 'crypto'

// Simple crypto helper for encrypting/decrypting sensitive secrets at rest
// AES-256-GCM with random 12-byte IV, output format: v1:<ivB64>:<tagB64>:<cipherB64>

function getEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY || ''
  if (!raw) {
    throw new Error('ENCRYPTION_KEY не установлен')
  }

  // Accept base64, hex, or arbitrary string. Normalize to 32 bytes using SHA-256 when needed.
  try {
    if (/^[A-Fa-f0-9]{64}$/.test(raw)) {
      return Buffer.from(raw, 'hex')
    }
    // Try base64
    const b64 = Buffer.from(raw, 'base64')
    if (b64.length === 32) return b64
  } catch (_) {
    // fallthrough to sha256
  }

  // Derive 32 bytes from provided string deterministically
  return crypto.createHash('sha256').update(raw, 'utf8').digest()
}

export function encryptSecret(plainText: string | undefined | null): string {
  const value = plainText ?? ''
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

export function decryptSecret(cipherText: string | undefined | null): string {
  const value = cipherText ?? ''
  if (!value) return ''
  // Backward compatibility: if value doesn't look like our envelope, treat as plaintext
  if (!value.startsWith('v1:')) return value

  const parts = value.split(':')
  if (parts.length !== 4) {
    // malformed, return as-is to avoid data loss
    return value
  }

  const [, ivB64, tagB64, dataB64] = parts
  const key = getEncryptionKey()
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const data = Buffer.from(dataB64, 'base64')

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
  return decrypted.toString('utf8')
}


