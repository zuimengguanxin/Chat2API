import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
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

let db: SqlJsDatabase | null = null
let SQL: any = null

export async function initStorage(): Promise<void> {
  const dbPath = getDbPath()
  console.log('Database path:', dbPath)
  
  SQL = await initSqlJs()
  
  if (existsSync(dbPath)) {
    const fileBuffer = readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }
  
  db.run(`PRAGMA journal_mode = WAL`)
  
  db.run(`
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
    )
  `)
  
  db.run(`
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
    )
  `)
  
  db.run(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `)
  
  db.run(`
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp INTEGER,
      account_id TEXT,
      provider_id TEXT,
      request_id TEXT,
      data TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS auth (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      password_hash TEXT NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key TEXT NOT NULL UNIQUE,
      enabled INTEGER DEFAULT 1,
      description TEXT,
      created_at INTEGER,
      last_used_at INTEGER,
      usage_count INTEGER DEFAULT 0
    )
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
  
  for (const [key, value] of Object.entries(defaultConfig)) {
    const existing = db.exec(`SELECT value FROM config WHERE key = ?`, [key])
    if (existing.length === 0 || existing[0].values.length === 0) {
      db.run(`INSERT INTO config (key, value) VALUES (?, ?)`, [key, JSON.stringify(value)])
    }
  }
  
  saveDatabase()
}

function saveDatabase(): void {
  if (db) {
    const data = db.export()
    const buffer = Buffer.from(data)
    const dbPath = getDbPath()
    writeFileSync(dbPath, buffer)
  }
}

export function getDb(): SqlJsDatabase {
  if (!db) throw new Error('Database not initialized')
  // Patch the database object to support better-sqlite3-like API
  return patchDatabase(db)
}

// Patch sql.js Database to support better-sqlite3-like API
function patchDatabase(database: SqlJsDatabase): any {
  // If already patched, return as-is
  if ((database as any)._patched) return database

  // Store original methods
  const originalPrepare = database.prepare.bind(database)
  const originalRun = database.run.bind(database)
  const originalExec = database.exec.bind(database)

  // Wrap run() to auto-save after write operations
  database.run = function(sql: string, params?: any[]) {
    const isWriteStatement = /^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|REPLACE)/i.test(sql)
    const result = originalRun(sql, params || [])
    if (isWriteStatement) {
      saveDatabase()
    }
    return result
  }

  // Add prepare method that supports chaining with all()/get()/run()
  (database as any).prepare = function(sql: string) {
    const stmt = originalPrepare(sql)
    const isWriteStatement = /^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|REPLACE)/i.test(sql)

    return {
      all: function(...params: any[]) {
        stmt.bind(params)
        const results: any[] = []
        while (stmt.step()) {
          results.push(stmt.getAsObject())
        }
        stmt.free()
        return results
      },
      get: function(...params: any[]) {
        stmt.bind(params)
        if (stmt.step()) {
          const result = stmt.getAsObject()
          stmt.free()
          return result
        }
        stmt.free()
        return null
      },
      run: function(...params: any[]) {
        // Use db.run for write operations
        database.run(sql, params)
        return { changes: 1, lastInsertRowid: 0 } // sql.js doesn't provide exact count
      },
      free: function() {
        // sql.js manages statement lifecycle differently
      }
    }
  }

  // Wrap exec() to auto-save after write operations
  database.exec = function(sql: string | string[]) {
    const result = originalExec(sql)
    // Check if any write operation was performed
    const sqlText = Array.isArray(sql) ? sql.join(';') : sql
    if (/^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|REPLACE)/mi.test(sqlText)) {
      saveDatabase()
    }
    return result
  }

  // Mark as patched
  (database as any)._patched = true
  return database
}

export function closeStorage(): void {
  if (db) {
    saveDatabase()
    db.close()
    db = null
  }
}

export { saveDatabase }
