import { Context, Next } from 'koa'
import crypto from 'crypto'
import { getDb } from '../storage/sqlite'

const AUTH_COOKIE_NAME = 'chat2api_auth'
const TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex')
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function isPasswordSet(): boolean {
  const db = getDb()
  const row = db.prepare('SELECT password_hash FROM auth WHERE id = 1').get() as any
  const hasPassword = !!row?.password_hash
  console.log('isPasswordSet check result:', hasPassword)
  return hasPassword
}

export function setPassword(password: string): void {
  const db = getDb()
  const hash = hashPassword(password)
  console.log('Setting password, hash length:', hash.length)
  const result = db.prepare('INSERT OR REPLACE INTO auth (id, password_hash) VALUES (1, ?)').run(hash)
  console.log('Password set result:', result)

  // 验证密码是否真的被保存了
  const verification = db.prepare('SELECT password_hash FROM auth WHERE id = 1').get() as any
  console.log('Verification check - password exists after set:', !!verification?.password_hash)
}

export function verifyPassword(password: string): boolean {
  const db = getDb()
  const row = db.prepare('SELECT password_hash FROM auth WHERE id = 1').get() as any
  if (!row?.password_hash) return false
  return row.password_hash === hashPassword(password)
}

const publicPaths = [
  '/api/auth/status',
  '/api/auth/verify',
  '/api/auth/setup',
  '/api/auth/login',
]

export async function authMiddleware(ctx: Context, next: Next) {
  if (publicPaths.some(p => ctx.path === p)) {
    return await next()
  }

  if (ctx.path.startsWith('/ws')) {
    return await next()
  }

  if (ctx.path.startsWith('/api')) {
    if (!isPasswordSet()) {
      ctx.status = 401
      ctx.body = { error: 'Password not set', needSetup: true }
      return
    }

    const token = ctx.cookies.get(AUTH_COOKIE_NAME)
    if (!token || !validateSessionToken(token)) {
      ctx.status = 401
      ctx.body = { error: 'Unauthorized' }
      return
    }
  }

  await next()
}

const sessionTokens = new Map<string, number>()

// Periodic cleanup of expired sessions (every hour)
setInterval(() => {
  const now = Date.now()
  for (const [token, expiry] of sessionTokens.entries()) {
    if (now > expiry) {
      sessionTokens.delete(token)
    }
  }
}, 60 * 60 * 1000)

export function validateSessionToken(token: string): boolean {
  const expiry = sessionTokens.get(token)
  if (!expiry) return false
  if (Date.now() > expiry) {
    sessionTokens.delete(token)
    return false
  }
  return true
}

export function createSession(): string {
  const token = generateToken()
  sessionTokens.set(token, Date.now() + TOKEN_EXPIRY)
  return token
}

export function destroySession(token: string): void {
  sessionTokens.delete(token)
}
