import crypto from 'crypto'

/**
 * AES-256-GCM encryption for the access token.
 * Format: iv:authTag:ciphertext (all hex-encoded)
 */
export function encrypt(plaintext: string, secret: string): string {
  const key = crypto.createHash('sha256').update(secret).digest()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')

  return `${iv.toString('hex')}:${authTag}:${encrypted}`
}

export function decrypt(encryptedStr: string, secret: string): string {
  const [ivHex, authTagHex, ciphertext] = encryptedStr.split(':')
  if (!ivHex || !authTagHex || !ciphertext) throw new Error('Invalid encrypted format')

  const key = crypto.createHash('sha256').update(secret).digest()
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
