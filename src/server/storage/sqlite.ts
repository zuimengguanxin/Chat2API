import Database from 'better-sqlite3'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16
const SALT_LENGTH = 32

function getEncryptionKey(): Buffer {
  const secretKey = process.env.SECRET_KEY || 'chat2api-default-secret-key-change-in-production'
  const salt = process.env.SECRET_SALT || 'chat2api-salt'
  return crypto.scryptSync(secretKey, salt, 32)
}

export function encryptData(data: string): string {
  if (!data) return data
  try {
    const key = getEncryptionKey()
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
    
    let encrypted = cipher.update(data, 'utf8', 'base64')
    encrypted += cipher.final('base64')
    
    const authTag = cipher.getAuthTag()
    
    const result = Buffer.concat([
      iv,
      authTag,
      Buffer.from(encrypted, 'base64')
    ])
    
    return result.toString('base64')
  } catch (error) {
    console.error('Encryption failed:', error)
    return data
  }
}

export function decryptData(encryptedData: string): string {
  if (!encryptedData) return encryptedData
  try {
    const key = getEncryptionKey()
    const buffer = Buffer.from(encryptedData, 'base64')
    
    const iv = buffer.subarray(0, IV_LENGTH)
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
    const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    
    let decrypted = decipher.update(encrypted, undefined, 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  } catch (error) {
    console.error('Decryption failed:', error)
    return encryptedData
  }
}

export function encryptCredentials(credentials: Record<string, string>): Record<string, string> {
  const encrypted: Record<string, string> = {}
  for (const [key, value] of Object.entries(credentials)) {
    encrypted[key] = encryptData(value)
  }
  return encrypted
}

export function decryptCredentials(encryptedCredentials: Record<string, string>): Record<string, string> {
  const decrypted: Record<string, string> = {}
  for (const [key, value] of Object.entries(encryptedCredentials)) {
    decrypted[key] = decryptData(value)
  }
  return decrypted
}

function getDbPath(): string {
  const dataDir = join(process.cwd(), 'data')
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }
  return join(dataDir, 'chat2api.db')
}

let db: Database.Database | null = null

export function initStorage(): void {
  const dbPath = getDbPath()
  console.log('Database path:', dbPath)
  
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'builtin',
      auth_type TEXT NOT NULL,
      api_endpoint TEXT,
      chat_path TEXT,
      headers TEXT,
      description TEXT,
      supported_models TEXT,
      model_mappings TEXT,
      enabled INTEGER DEFAULT 1,
      status TEXT DEFAULT 'unknown',
      last_status_check INTEGER,
      created_at INTEGER,
      updated_at INTEGER
    );
    
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      credentials TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      daily_limit INTEGER,
      today_used INTEGER DEFAULT 0,
      request_count INTEGER DEFAULT 0,
      last_used INTEGER,
      created_at INTEGER,
      updated_at INTEGER,
      FOREIGN KEY (provider_id) REFERENCES providers(id)
    );
    
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp INTEGER,
      account_id TEXT,
      provider_id TEXT,
      request_id TEXT,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS auth (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      password_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key TEXT NOT NULL UNIQUE,
      enabled INTEGER DEFAULT 1,
      description TEXT,
      created_at INTEGER,
      last_used_at INTEGER,
      usage_count INTEGER DEFAULT 0
    );
  `)
  
  const defaultConfig = {
    proxyPort: 8310,
    autoStartProxy: false,
    loadBalanceStrategy: 'round-robin',
    theme: 'system',
    autoStart: false,
    minimizeToTray: true,
    logLevel: 'info',
    logRetentionDays: 7,
    requestTimeout: 60000,
    retryCount: 3,
    enableApiKey: false,
    apiKeys: [],
    modelMappings: {},
  }
  
  const insertConfig = db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)')
  for (const [key, value] of Object.entries(defaultConfig)) {
    insertConfig.run(key, JSON.stringify(value))
  }
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function closeStorage(): void {
  if (db) {
    db.close()
    db = null
  }
}
