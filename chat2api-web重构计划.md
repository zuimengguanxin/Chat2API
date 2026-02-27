# Chat2API Web化重构执行计划（修正版 V2）

> 本计划供 Trae AI 执行，已修正以下问题：
> - 移除Electron依赖
> - 移除OAuth登录功能（保留Token手动输入）
> - 使用AES-256-GCM替代safeStorage加密
> - 补充遗漏模块（ProviderManager、AccountManager等）
> - 完善所有API端点
> - 优化Dockerfile构建流程

---

## 一、最终架构

```
┌─────────────────────────────────────────┐
│            Docker Container             │
│  ┌───────────────────────────────────┐  │
│  │         Koa Server (:3000)        │  │
│  │  ┌─────────┐ ┌─────────────────┐  │  │
│  │  │ 静态文件 │ │  API服务        │  │  │
│  │  │ (前端)  │ │  /api/*         │  │  │
│  │  └─────────┘ └─────────────────┘  │  │
│  │  ┌─────────┐ ┌─────────────────┐  │  │
│  │  │ 代理服务 │ │  WebSocket      │  │  │
│  │  │ :8310   │ │  /ws            │  │  │
│  │  └─────────┘ └─────────────────┘  │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │  SQLite (data/chat2api.db)        │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

---

## 二、执行任务

### 任务1: 创建SQLite存储层（含AES-256-GCM加密）

**创建文件**: `src/server/storage/sqlite.ts`

```typescript
import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, mkdirSync } from 'fs'
import crypto from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))

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
```

---

### 任务2: 创建Provider存储管理器

**创建文件**: `src/server/storage/providers.ts`

```typescript
import { getDb } from './sqlite'
import type { Provider, ProviderStatus } from '../../shared/types'
import { BUILTIN_PROVIDERS } from './builtin'

export const ProviderManager = {
  getAll(): Provider[] {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM providers ORDER BY created_at DESC').all() as any[]
    return rows.map(row => this.rowToProvider(row))
  },

  getById(id: string): Provider | null {
    const db = getDb()
    const row = db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as any
    if (!row) return null
    return this.rowToProvider(row)
  },

  rowToProvider(row: any): Provider {
    return {
      id: row.id,
      name: row.name,
      type: row.type || 'builtin',
      authType: row.auth_type,
      apiEndpoint: row.api_endpoint,
      chatPath: row.chat_path,
      headers: row.headers ? JSON.parse(row.headers) : {},
      enabled: row.enabled === 1,
      description: row.description,
      supportedModels: row.supported_models ? JSON.parse(row.supported_models) : undefined,
      modelMappings: row.model_mappings ? JSON.parse(row.model_mappings) : undefined,
      status: row.status as ProviderStatus,
      lastStatusCheck: row.last_status_check,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  },

  create(data: Partial<Provider>): Provider {
    const db = getDb()
    const id = data.id || `custom_${Date.now()}`
    const now = Date.now()
    
    const stmt = db.prepare(`
      INSERT INTO providers (id, name, type, auth_type, api_endpoint, chat_path, headers, description, supported_models, model_mappings, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    
    stmt.run(
      id,
      data.name,
      data.type || 'custom',
      data.authType,
      data.apiEndpoint,
      data.chatPath || null,
      data.headers ? JSON.stringify(data.headers) : '{}',
      data.description || null,
      data.supportedModels ? JSON.stringify(data.supportedModels) : null,
      data.modelMappings ? JSON.stringify(data.modelMappings) : null,
      data.enabled !== false ? 1 : 0,
      now,
      now
    )
    
    return this.getById(id)!
  },

  update(id: string, updates: Partial<Provider>): Provider | null {
    const db = getDb()
    const existing = this.getById(id)
    if (!existing) return null
    
    const updated = { ...existing, ...updates, updatedAt: Date.now() }
    
    db.prepare(`
      UPDATE providers SET 
        name = ?, auth_type = ?, api_endpoint = ?, chat_path = ?, headers = ?, 
        description = ?, supported_models = ?, model_mappings = ?, enabled = ?,
        status = ?, last_status_check = ?, updated_at = ? 
      WHERE id = ?
    `).run(
      updated.name,
      updated.authType,
      updated.apiEndpoint,
      updated.chatPath || null,
      JSON.stringify(updated.headers || {}),
      updated.description || null,
      updated.supportedModels ? JSON.stringify(updated.supportedModels) : null,
      updated.modelMappings ? JSON.stringify(updated.modelMappings) : null,
      updated.enabled ? 1 : 0,
      updated.status,
      updated.lastStatusCheck,
      updated.updatedAt,
      id
    )
    
    return this.getById(id)
  },

  delete(id: string): boolean {
    const db = getDb()
    const provider = this.getById(id)
    if (!provider) return false
    if (provider.type === 'builtin') return false
    
    db.prepare('DELETE FROM accounts WHERE provider_id = ?').run(id)
    const result = db.prepare('DELETE FROM providers WHERE id = ?').run(id)
    return result.changes > 0
  },

  ensureExists(providerId: string): void {
    const existing = this.getById(providerId)
    if (!existing) {
      const builtin = BUILTIN_PROVIDERS.find(p => p.id === providerId)
      if (builtin) {
        this.create({
          id: builtin.id,
          name: builtin.name,
          type: 'builtin',
          authType: builtin.authType,
          apiEndpoint: builtin.apiEndpoint,
          chatPath: builtin.chatPath,
          headers: builtin.headers,
          description: builtin.description,
          supportedModels: builtin.supportedModels,
          modelMappings: builtin.modelMappings,
          enabled: true,
        })
      }
    }
  },

  duplicate(id: string): Provider | null {
    const original = this.getById(id)
    if (!original) return null
    
    return this.create({
      ...original,
      id: undefined,
      name: `${original.name} (Copy)`,
      type: 'custom',
    })
  },

  exportProvider(id: string): string | null {
    const provider = this.getById(id)
    if (!provider) return null
    
    const exportData = {
      name: provider.name,
      authType: provider.authType,
      apiEndpoint: provider.apiEndpoint,
      chatPath: provider.chatPath,
      headers: provider.headers,
      description: provider.description,
      supportedModels: provider.supportedModels,
      modelMappings: provider.modelMappings,
    }
    
    return JSON.stringify(exportData, null, 2)
  },

  importProvider(jsonData: string): Provider | null {
    try {
      const data = JSON.parse(jsonData)
      return this.create({
        ...data,
        type: 'custom',
      })
    } catch (error) {
      console.error('Failed to import provider:', error)
      return null
    }
  },
}
```

---

### 任务3: 创建Account存储管理器

**创建文件**: `src/server/storage/accounts.ts`

```typescript
import { getDb, encryptCredentials, decryptCredentials } from './sqlite'
import type { Account, AccountStatus } from '../../shared/types'

export const AccountManager = {
  getAll(includeCredentials: boolean = false): Account[] {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM accounts ORDER BY created_at DESC').all() as any[]
    return rows.map(row => this.rowToAccount(row, includeCredentials))
  },

  getById(id: string, includeCredentials: boolean = false): Account | null {
    const db = getDb()
    const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as any
    if (!row) return null
    return this.rowToAccount(row, includeCredentials)
  },

  getByProviderId(providerId: string, includeCredentials: boolean = false): Account[] {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM accounts WHERE provider_id = ? ORDER BY created_at DESC').all(providerId) as any[]
    return rows.map(row => this.rowToAccount(row, includeCredentials))
  },

  rowToAccount(row: any, includeCredentials: boolean): Account {
    let credentials = {}
    if (row.credentials) {
      try {
        const parsed = JSON.parse(row.credentials)
        credentials = includeCredentials ? decryptCredentials(parsed) : {}
      } catch (e) {
        console.error('Failed to parse credentials:', e)
      }
    }
    
    return {
      id: row.id,
      providerId: row.provider_id,
      name: row.name,
      email: row.email,
      credentials,
      status: row.status as AccountStatus,
      dailyLimit: row.daily_limit,
      todayUsed: row.today_used || 0,
      requestCount: row.request_count || 0,
      lastUsed: row.last_used,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  },

  create(data: { providerId: string; name: string; email?: string; credentials: Record<string, string>; dailyLimit?: number }): Account {
    const db = getDb()
    const id = `account_${Date.now()}`
    const now = Date.now()
    
    const encryptedCredentials = encryptCredentials(data.credentials)
    
    db.prepare(`
      INSERT INTO accounts (id, provider_id, name, email, credentials, status, daily_limit, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.providerId,
      data.name,
      data.email || null,
      JSON.stringify(encryptedCredentials),
      'active',
      data.dailyLimit || null,
      now,
      now
    )
    
    return this.getById(id, true)!
  },

  update(id: string, updates: Partial<Account>): Account | null {
    const db = getDb()
    const existing = this.getById(id, true)
    if (!existing) return null
    
    const updated = { ...existing, ...updates, updatedAt: Date.now() }
    
    let credentialsJson = JSON.stringify(encryptCredentials(existing.credentials))
    if (updates.credentials) {
      credentialsJson = JSON.stringify(encryptCredentials(updates.credentials))
    }
    
    db.prepare(`
      UPDATE accounts SET 
        name = ?, email = ?, credentials = ?, status = ?, daily_limit = ?,
        today_used = ?, request_count = ?, last_used = ?, updated_at = ? 
      WHERE id = ?
    `).run(
      updated.name,
      updated.email || null,
      credentialsJson,
      updated.status,
      updated.dailyLimit || null,
      updated.todayUsed || 0,
      updated.requestCount || 0,
      updated.lastUsed || null,
      updated.updatedAt,
      id
    )
    
    return this.getById(id, !!updates.credentials)
  },

  delete(id: string): boolean {
    const db = getDb()
    const result = db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
    return result.changes > 0
  },

  getActiveAccounts(includeCredentials: boolean = false): Account[] {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM accounts WHERE status = ?').all('active') as any[]
    return rows.map(row => this.rowToAccount(row, includeCredentials))
  },

  incrementRequestCount(id: string): void {
    const db = getDb()
    db.prepare(`
      UPDATE accounts SET 
        request_count = request_count + 1, 
        last_used = ? 
      WHERE id = ?
    `).run(Date.now(), id)
  },

  resetDailyUsage(): void {
    const db = getDb()
    db.prepare('UPDATE accounts SET today_used = 0').run()
  },
}
```

---

### 任务4: 创建Config存储管理器

**创建文件**: `src/server/storage/config.ts`

```typescript
import { getDb } from './sqlite'
import type { AppConfig, ApiKey, ModelMapping, LoadBalanceStrategy, Theme } from '../../shared/types'

const DEFAULT_CONFIG: AppConfig = {
  proxyPort: 8310,
  loadBalanceStrategy: 'round-robin',
  modelMappings: {},
  theme: 'system',
  autoStart: false,
  autoStartProxy: false,
  minimizeToTray: true,
  logLevel: 'info',
  logRetentionDays: 7,
  requestTimeout: 60000,
  retryCount: 3,
  apiKeys: [],
  enableApiKey: false,
  oauthProxyMode: 'system',
}

export const ConfigManager = {
  get(): AppConfig {
    const db = getDb()
    const rows = db.prepare('SELECT key, value FROM config').all() as { key: string; value: string }[]
    const config: Record<string, any> = { ...DEFAULT_CONFIG }
    
    for (const row of rows) {
      try {
        config[row.key] = JSON.parse(row.value)
      } catch {
        config[row.key] = row.value
      }
    }
    
    return config as AppConfig
  },

  set(config: Partial<AppConfig>): void {
    const db = getDb()
    const stmt = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)')
    for (const [key, value] of Object.entries(config)) {
      stmt.run(key, JSON.stringify(value))
    }
  },

  update(updates: Partial<AppConfig>): AppConfig {
    this.set(updates)
    return this.get()
  },

  reset(): AppConfig {
    const db = getDb()
    db.exec('DELETE FROM config')
    this.set(DEFAULT_CONFIG)
    return DEFAULT_CONFIG
  },

  getApiKeys(): ApiKey[] {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC').all() as any[]
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      key: row.key,
      enabled: row.enabled === 1,
      description: row.description,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      usageCount: row.usage_count || 0,
    }))
  },

  addApiKey(data: { name: string; key: string; description?: string }): ApiKey {
    const db = getDb()
    const id = `apikey_${Date.now()}`
    const now = Date.now()
    
    db.prepare(`
      INSERT INTO api_keys (id, name, key, enabled, description, created_at, usage_count)
      VALUES (?, ?, ?, 1, ?, ?, 0)
    `).run(id, data.name, data.key, data.description || null, now)
    
    return {
      id,
      name: data.name,
      key: data.key,
      enabled: true,
      description: data.description,
      createdAt: now,
      usageCount: 0,
    }
  },

  updateApiKey(id: string, updates: Partial<ApiKey>): ApiKey | null {
    const db = getDb()
    const existing = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id) as any
    if (!existing) return null
    
    db.prepare(`
      UPDATE api_keys SET name = ?, enabled = ?, description = ? WHERE id = ?
    `).run(
      updates.name ?? existing.name,
      updates.enabled ? 1 : 0,
      updates.description ?? existing.description,
      id
    )
    
    return this.getApiKeys().find(k => k.id === id) || null
  },

  deleteApiKey(id: string): boolean {
    const db = getDb()
    const result = db.prepare('DELETE FROM api_keys WHERE id = ?').run(id)
    return result.changes > 0
  },

  validateApiKey(key: string): ApiKey | null {
    const db = getDb()
    const row = db.prepare('SELECT * FROM api_keys WHERE key = ? AND enabled = 1').get(key) as any
    if (!row) return null
    
    db.prepare('UPDATE api_keys SET last_used_at = ?, usage_count = usage_count + 1 WHERE id = ?')
      .run(Date.now(), row.id)
    
    return {
      id: row.id,
      name: row.name,
      key: row.key,
      enabled: true,
      description: row.description,
      createdAt: row.created_at,
      lastUsedAt: Date.now(),
      usageCount: row.usage_count + 1,
    }
  },
}
```

---

### 任务5: 创建Log存储管理器

**创建文件**: `src/server/storage/logs.ts`

```typescript
import { getDb } from './sqlite'
import type { LogEntry, LogLevel } from '../../shared/types'

export const LogManager = {
  get(limit: number = 100, level?: LogLevel, offset: number = 0): LogEntry[] {
    const db = getDb()
    let sql = 'SELECT * FROM logs'
    const params: any[] = []
    
    if (level) {
      sql += ' WHERE level = ?'
      params.push(level)
    }
    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)
    
    const rows = db.prepare(sql).all(...params) as any[]
    return rows.map(row => ({
      id: row.id,
      level: row.level,
      message: row.message,
      timestamp: row.timestamp,
      accountId: row.account_id,
      providerId: row.provider_id,
      requestId: row.request_id,
      data: row.data ? JSON.parse(row.data) : undefined,
    }))
  },

  add(entry: Omit<LogEntry, 'id'>): LogEntry {
    const db = getDb()
    const id = `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    db.prepare(`
      INSERT INTO logs (id, level, message, timestamp, account_id, provider_id, request_id, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      entry.level,
      entry.message,
      entry.timestamp || Date.now(),
      entry.accountId || null,
      entry.providerId || null,
      entry.requestId || null,
      entry.data ? JSON.stringify(entry.data) : null
    )
    
    return { id, ...entry }
  },

  getById(id: string): LogEntry | undefined {
    const db = getDb()
    const row = db.prepare('SELECT * FROM logs WHERE id = ?').get(id) as any
    if (!row) return undefined
    return {
      id: row.id,
      level: row.level,
      message: row.message,
      timestamp: row.timestamp,
      accountId: row.account_id,
      providerId: row.provider_id,
      requestId: row.request_id,
      data: row.data ? JSON.parse(row.data) : undefined,
    }
  },

  getStats(): { total: number; info: number; warn: number; error: number; debug: number } {
    const db = getDb()
    const rows = db.prepare('SELECT level, COUNT(*) as count FROM logs GROUP BY level').all() as { level: string; count: number }[]
    const stats = { total: 0, info: 0, warn: 0, error: 0, debug: 0 }
    for (const row of rows) {
      stats.total += row.count
      if (row.level in stats) {
        stats[row.level as keyof typeof stats] = row.count
      }
    }
    return stats
  },

  getTrend(days: number = 7): { date: string; total: number; info: number; warn: number; error: number }[] {
    const db = getDb()
    const logs = db.prepare('SELECT * FROM logs').all() as any[]
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    const trends: { date: string; total: number; info: number; warn: number; error: number }[] = []

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = now - (i + 1) * dayMs
      const dayEnd = now - i * dayMs
      const date = new Date(dayStart).toISOString().split('T')[0]

      const dayLogs = logs.filter(l => l.timestamp >= dayStart && l.timestamp < dayEnd)

      trends.push({
        date,
        total: dayLogs.length,
        info: dayLogs.filter(l => l.level === 'info').length,
        warn: dayLogs.filter(l => l.level === 'warn').length,
        error: dayLogs.filter(l => l.level === 'error').length,
      })
    }

    return trends
  },

  getAccountTrend(accountId: string, days: number = 7): { date: string; total: number; info: number; warn: number; error: number }[] {
    const db = getDb()
    const logs = db.prepare('SELECT * FROM logs WHERE account_id = ? AND request_id IS NOT NULL').all(accountId) as any[]
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    const trends: { date: string; total: number; info: number; warn: number; error: number }[] = []

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = now - (i + 1) * dayMs
      const dayEnd = now - i * dayMs
      const date = new Date(dayStart).toISOString().split('T')[0]

      const dayLogs = logs.filter(l => l.timestamp >= dayStart && l.timestamp < dayEnd)

      trends.push({
        date,
        total: dayLogs.filter(l => l.level === 'info').length,
        info: dayLogs.filter(l => l.level === 'info').length,
        warn: dayLogs.filter(l => l.level === 'warn').length,
        error: dayLogs.filter(l => l.level === 'error').length,
      })
    }

    return trends
  },

  clear(): void {
    const db = getDb()
    db.exec('DELETE FROM logs')
  },

  export(format: 'json' | 'txt' = 'json'): string {
    const db = getDb()
    const logs = db.prepare('SELECT * FROM logs ORDER BY timestamp DESC').all() as any[]

    if (format === 'json') {
      return JSON.stringify(logs.map(l => ({
        ...l,
        data: l.data ? JSON.parse(l.data) : undefined,
      })), null, 2)
    }

    return logs.map(log => {
      const time = new Date(log.timestamp).toISOString()
      const level = log.level.toUpperCase().padEnd(5)
      let line = `[${time}] [${level}] ${log.message}`
      if (log.provider_id) line += ` | Provider: ${log.provider_id}`
      if (log.account_id) line += ` | Account: ${log.account_id}`
      if (log.request_id) line += ` | Request: ${log.request_id}`
      if (log.data) line += ` | Data: ${log.data}`
      return line
    }).join('\n')
  },

  cleanExpired(retentionDays: number): void {
    const db = getDb()
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    db.prepare('DELETE FROM logs WHERE timestamp < ?').run(cutoff)
  },
}
```

---

### 任务6: 创建内置提供商配置

**创建文件**: `src/server/storage/builtin.ts`

```typescript
import type { AuthType } from '../../shared/types'

export interface BuiltinProviderConfig {
  id: string
  name: string
  authType: AuthType
  apiEndpoint: string
  chatPath: string
  headers: Record<string, string>
  description: string
  supportedModels?: string[]
  modelMappings?: Record<string, string>
}

export const BUILTIN_PROVIDERS: BuiltinProviderConfig[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    authType: 'token',
    apiEndpoint: 'https://api.deepseek.com',
    chatPath: '/v1/chat/completions',
    headers: { 'Content-Type': 'application/json' },
    description: 'DeepSeek AI API',
    supportedModels: ['deepseek-chat', 'deepseek-coder'],
  },
  {
    id: 'glm',
    name: '智谱 GLM',
    authType: 'token',
    apiEndpoint: 'https://open.bigmodel.cn',
    chatPath: '/api/paas/v4/chat/completions',
    headers: { 'Content-Type': 'application/json' },
    description: '智谱 AI GLM 模型',
    supportedModels: ['glm-4', 'glm-4-flash', 'glm-4-plus'],
  },
  {
    id: 'kimi',
    name: 'Kimi (月之暗面)',
    authType: 'token',
    apiEndpoint: 'https://api.moonshot.cn',
    chatPath: '/v1/chat/completions',
    headers: { 'Content-Type': 'application/json' },
    description: 'Moonshot Kimi API',
    supportedModels: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    authType: 'realUserID_token',
    apiEndpoint: 'https://api.minimax.chat',
    chatPath: '/v1/chat/completions',
    headers: { 'Content-Type': 'application/json' },
    description: 'MiniMax AI API',
    supportedModels: ['abab6.5-chat', 'abab6.5s-chat', 'abab5.5-chat'],
  },
  {
    id: 'qwen',
    name: '通义千问 (Qwen)',
    authType: 'token',
    apiEndpoint: 'https://dashscope.aliyuncs.com',
    chatPath: '/compatible-mode/v1/chat/completions',
    headers: { 'Content-Type': 'application/json' },
    description: '阿里云通义千问 API',
    supportedModels: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
  },
  {
    id: 'qwen-ai',
    name: '通义千问 (Qwen AI)',
    authType: 'tongyi_sso_ticket',
    apiEndpoint: 'https://qianwen.biz.aliyun.com',
    chatPath: '/conversation',
    headers: { 'Content-Type': 'application/json' },
    description: '通义千问网页版',
    supportedModels: ['qwen-max', 'qwen-plus', 'qwen-turbo'],
  },
  {
    id: 'zai',
    name: 'Zai',
    authType: 'token',
    apiEndpoint: 'https://api.zai.com',
    chatPath: '/v1/chat/completions',
    headers: { 'Content-Type': 'application/json' },
    description: 'Zai API',
    supportedModels: ['zai-chat'],
  },
]

export function getBuiltinProvider(id: string): BuiltinProviderConfig | undefined {
  return BUILTIN_PROVIDERS.find(p => p.id === id)
}

export function getBuiltinProviders(): BuiltinProviderConfig[] {
  return BUILTIN_PROVIDERS
}
```

---

### 任务7: 创建认证中间件

**创建文件**: `src/server/middleware/auth.ts`

```typescript
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
  return !!row?.password_hash
}

export function setPassword(password: string): void {
  const db = getDb()
  const hash = hashPassword(password)
  db.prepare('INSERT OR REPLACE INTO auth (id, password_hash) VALUES (1, ?)').run(hash)
}

export function verifyPassword(password: string): boolean {
  const db = getDb()
  const row = db.prepare('SELECT password_hash FROM auth WHERE id = 1').get() as any
  if (!row?.password_hash) return false
  return row.password_hash === hashPassword(password)
}

const publicPaths = [
  '/api/auth/status',
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

function validateSessionToken(token: string): boolean {
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
```

---

### 任务8: 创建后端服务入口

**创建文件**: `src/server/index.ts`

```typescript
import Koa from 'koa'
import Router from '@koa/router'
import bodyParser from 'koa-bodyparser'
import serve from 'koa-static'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { join } from 'path'
import { existsSync } from 'fs'
import { initStorage, closeStorage } from './storage/sqlite'
import { authMiddleware } from './middleware/auth'
import { registerRoutes } from './api'
import { createAuthRouter } from './api/auth'
import { ProxyServer } from '../main/proxy/server'
import { LogManager } from './storage/logs'
import { broadcast } from './websocket'

const app = new Koa()
const router = new Router()
const server = createServer(app.callback())
const wss = new WebSocketServer({ server })

initStorage()

app.use(bodyParser())
app.use(authMiddleware)

router.use('/api/auth', createAuthRouter().routes())
registerRoutes(router)
app.use(router.routes())
app.use(router.allowedMethods())

const staticPath = join(process.cwd(), 'dist', 'web')
if (existsSync(staticPath)) {
  app.use(serve(staticPath))
}

router.get('(.*)', async (ctx) => {
  ctx.type = 'html'
  ctx.body = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chat2API</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>`
})

const clients = new Set<WebSocket>()
wss.on('connection', (ws) => {
  clients.add(ws)
  ws.on('close', () => clients.delete(ws))
})

export function broadcast(type: string, data: unknown) {
  const message = JSON.stringify({ type, data })
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  })
}

let proxyServer: ProxyServer | null = null

const PORT = process.env.PORT || 3000
const PROXY_PORT = process.env.PROXY_PORT || 8310

server.listen(PORT, async () => {
  console.log(`Chat2API Server running at http://localhost:${PORT}`)
  console.log(`WebSocket: ws://localhost:${PORT}/ws`)
  
  try {
    proxyServer = new ProxyServer()
    await proxyServer.start(Number(PROXY_PORT))
    console.log(`Proxy server: http://localhost:${PROXY_PORT}`)
  } catch (error) {
    console.error('Failed to start proxy server:', error)
  }
})

process.on('SIGINT', () => {
  closeStorage()
  process.exit(0)
})

export { proxyServer }
```

---

### 任务9: 创建WebSocket模块

**创建文件**: `src/server/websocket.ts`

```typescript
import { WebSocket } from 'ws'

const clients = new Set<WebSocket>()

export function addClient(ws: WebSocket): void {
  clients.add(ws)
}

export function removeClient(ws: WebSocket): void {
  clients.delete(ws)
}

export function broadcast(type: string, data: unknown): void {
  const message = JSON.stringify({ type, data })
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  })
}

export function broadcastLog(log: any): void {
  broadcast('log:new', log)
}

export function broadcastProxyStatus(status: any): void {
  broadcast('proxy:status', status)
}
```

---

### 任务10: 创建完整API路由

**创建文件**: `src/server/api/index.ts`

```typescript
import Router from '@koa/router'
import { createProvidersRouter } from './providers'
import { createAccountsRouter } from './accounts'
import { createProxyRouter } from './proxy'
import { createLogsRouter } from './logs'
import { createConfigRouter } from './config'
import { createApiKeysRouter } from './apikeys'

export function registerRoutes(router: Router) {
  router.use('/api/providers', createProvidersRouter().routes())
  router.use('/api/accounts', createAccountsRouter().routes())
  router.use('/api/proxy', createProxyRouter().routes())
  router.use('/api/logs', createLogsRouter().routes())
  router.use('/api/config', createConfigRouter().routes())
  router.use('/api/api-keys', createApiKeysRouter().routes())
}
```

**创建文件**: `src/server/api/auth.ts`

```typescript
import Router from '@koa/router'
import { isPasswordSet, setPassword, verifyPassword, createSession, destroySession } from '../middleware/auth'

const AUTH_COOKIE_NAME = 'chat2api_auth'

export function createAuthRouter() {
  const router = new Router()

  router.get('/status', async (ctx) => {
    ctx.body = { 
      hasPassword: isPasswordSet(),
      needSetup: !isPasswordSet()
    }
  })

  router.post('/setup', async (ctx) => {
    if (isPasswordSet()) {
      ctx.status = 400
      ctx.body = { error: 'Password already set' }
      return
    }

    const { password } = ctx.request.body as any
    if (!password || password.length < 4) {
      ctx.status = 400
      ctx.body = { error: 'Password must be at least 4 characters' }
      return
    }

    setPassword(password)
    const token = createSession()
    ctx.cookies.set(AUTH_COOKIE_NAME, token, { 
      httpOnly: true, 
      maxAge: 7 * 24 * 60 * 60 * 1000 
    })
    ctx.body = { success: true }
  })

  router.post('/login', async (ctx) => {
    const { password } = ctx.request.body as any
    
    if (!verifyPassword(password)) {
      ctx.status = 401
      ctx.body = { error: 'Invalid password' }
      return
    }

    const token = createSession()
    ctx.cookies.set(AUTH_COOKIE_NAME, token, { 
      httpOnly: true, 
      maxAge: 7 * 24 * 60 * 60 * 1000 
    })
    ctx.body = { success: true }
  })

  router.post('/logout', async (ctx) => {
    const token = ctx.cookies.get(AUTH_COOKIE_NAME)
    if (token) {
      destroySession(token)
      ctx.cookies.set(AUTH_COOKIE_NAME, '', { maxAge: 0 })
    }
    ctx.body = { success: true }
  })

  return router
}
```

**创建文件**: `src/server/api/providers.ts`

```typescript
import Router from '@koa/router'
import { ProviderManager } from '../storage/providers'
import { getBuiltinProviders } from '../storage/builtin'
import { ProviderChecker } from '../../main/providers/checker'

export function createProvidersRouter() {
  const router = new Router()

  router.get('/', async (ctx) => {
    ctx.body = ProviderManager.getAll()
  })

  router.get('/builtin', async (ctx) => {
    ctx.body = getBuiltinProviders()
  })

  router.get('/:id', async (ctx) => {
    const provider = ProviderManager.getById(ctx.params.id)
    if (!provider) {
      ctx.status = 404
      ctx.body = { error: 'Provider not found' }
      return
    }
    ctx.body = provider
  })

  router.post('/', async (ctx) => {
    ctx.body = ProviderManager.create(ctx.request.body as any)
  })

  router.put('/:id', async (ctx) => {
    const provider = ProviderManager.update(ctx.params.id, ctx.request.body as any)
    if (!provider) {
      ctx.status = 404
      ctx.body = { error: 'Provider not found' }
      return
    }
    ctx.body = provider
  })

  router.delete('/:id', async (ctx) => {
    const result = ProviderManager.delete(ctx.params.id)
    ctx.body = { success: result }
  })

  router.get('/:id/status', async (ctx) => {
    const provider = ProviderManager.getById(ctx.params.id)
    if (!provider) {
      ctx.body = { providerId: ctx.params.id, status: 'unknown', error: 'Not found' }
      return
    }
    const result = await ProviderChecker.checkProviderStatus(provider)
    ProviderManager.update(ctx.params.id, {
      status: result.status,
      lastStatusCheck: Date.now(),
    })
    ctx.body = result
  })

  router.post('/check-all', async (ctx) => {
    const providers = ProviderManager.getAll()
    const results: Record<string, any> = {}
    
    await Promise.all(providers.map(async (provider) => {
      const result = await ProviderChecker.checkProviderStatus(provider)
      results[provider.id] = result
      ProviderManager.update(provider.id, {
        status: result.status,
        lastStatusCheck: Date.now(),
      })
    }))
    
    ctx.body = results
  })

  router.post('/:id/duplicate', async (ctx) => {
    const provider = ProviderManager.duplicate(ctx.params.id)
    if (!provider) {
      ctx.status = 404
      ctx.body = { error: 'Provider not found' }
      return
    }
    ctx.body = provider
  })

  router.get('/:id/export', async (ctx) => {
    const data = ProviderManager.exportProvider(ctx.params.id)
    if (!data) {
      ctx.status = 404
      ctx.body = { error: 'Provider not found' }
      return
    }
    ctx.body = { data }
  })

  router.post('/import', async (ctx) => {
    const { data } = ctx.request.body as any
    const provider = ProviderManager.importProvider(data)
    if (!provider) {
      ctx.status = 400
      ctx.body = { error: 'Invalid provider data' }
      return
    }
    ctx.body = provider
  })

  return router
}
```

**创建文件**: `src/server/api/accounts.ts`

```typescript
import Router from '@koa/router'
import { AccountManager } from '../storage/accounts'
import { ProviderManager } from '../storage/providers'
import { ProviderChecker } from '../../main/providers/checker'

export function createAccountsRouter() {
  const router = new Router()

  router.get('/', async (ctx) => {
    const { includeCredentials } = ctx.query
    ctx.body = AccountManager.getAll(includeCredentials === 'true')
  })

  router.get('/:id', async (ctx) => {
    const { includeCredentials } = ctx.query
    const account = AccountManager.getById(ctx.params.id, includeCredentials === 'true')
    if (!account) {
      ctx.status = 404
      ctx.body = { error: 'Account not found' }
      return
    }
    ctx.body = account
  })

  router.get('/provider/:providerId', async (ctx) => {
    const { includeCredentials } = ctx.query
    ctx.body = AccountManager.getByProviderId(ctx.params.providerId, includeCredentials === 'true')
  })

  router.post('/', async (ctx) => {
    ctx.body = AccountManager.create(ctx.request.body as any)
  })

  router.put('/:id', async (ctx) => {
    const account = AccountManager.update(ctx.params.id, ctx.request.body as any)
    if (!account) {
      ctx.status = 404
      ctx.body = { error: 'Account not found' }
      return
    }
    ctx.body = account
  })

  router.delete('/:id', async (ctx) => {
    const result = AccountManager.delete(ctx.params.id)
    ctx.body = { success: result }
  })

  router.post('/:id/validate', async (ctx) => {
    const account = AccountManager.getById(ctx.params.id, true)
    if (!account) {
      ctx.body = { valid: false, error: 'Account not found' }
      return
    }
    const provider = ProviderManager.getById(account.providerId)
    if (!provider) {
      ctx.body = { valid: false, error: 'Provider not found' }
      return
    }
    const result = await ProviderChecker.checkAccountToken(provider, account)
    ctx.body = result
  })

  router.post('/validate-token', async (ctx) => {
    const { providerId, credentials } = ctx.request.body as any
    const provider = ProviderManager.getById(providerId)
    if (!provider) {
      ctx.body = { valid: false, error: 'Provider not found' }
      return
    }
    const tempAccount = {
      id: 'temp',
      providerId,
      name: 'temp',
      credentials,
      status: 'active' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    ctx.body = await ProviderChecker.checkAccountToken(provider, tempAccount)
  })

  router.get('/:id/credits', async (ctx) => {
    const account = AccountManager.getById(ctx.params.id, true)
    if (!account) {
      ctx.status = 404
      ctx.body = { error: 'Account not found' }
      return
    }
    
    const provider = ProviderManager.getById(account.providerId)
    if (!provider || provider.id !== 'minimax') {
      ctx.body = null
      return
    }

    try {
      const { MiniMaxAdapter } = await import('../../main/proxy/adapters/minimax')
      const adapter = new MiniMaxAdapter(provider, account)
      ctx.body = await adapter.getCredits()
    } catch (error) {
      console.error('Failed to get credits:', error)
      ctx.body = null
    }
  })

  return router
}
```

**创建文件**: `src/server/api/proxy.ts`

```typescript
import Router from '@koa/router'
import { ProxyServer } from '../../main/proxy/server'
import { broadcast } from '../websocket'
import { proxyServer } from '../index'

let proxyStartTime: number | null = null
let currentPort: number = 8310

export function createProxyRouter() {
  const router = new Router()

  router.post('/start', async (ctx) => {
    const { port } = (ctx.request.body as any) || {}
    const targetPort = port || 8310
    
    if (proxyServer) {
      ctx.body = { success: true, message: 'Already running', port: currentPort }
      return
    }

    try {
      const server = new ProxyServer()
      const success = await server.start(targetPort)
      
      if (success) {
        currentPort = targetPort
        proxyStartTime = Date.now()
        broadcast('proxy:status', { isRunning: true, port: targetPort })
        ctx.body = { success: true, port: targetPort }
      } else {
        ctx.body = { success: false, error: 'Failed to start' }
      }
    } catch (error: any) {
      ctx.body = { success: false, error: error.message }
    }
  })

  router.post('/stop', async (ctx) => {
    if (!proxyServer) {
      ctx.body = { success: true }
      return
    }

    try {
      await proxyServer.stop()
      proxyStartTime = null
      broadcast('proxy:status', { isRunning: false })
      ctx.body = { success: true }
    } catch (error: any) {
      ctx.body = { success: false, error: error.message }
    }
  })

  router.get('/status', async (ctx) => {
    ctx.body = {
      isRunning: proxyServer !== null,
      port: currentPort,
      uptime: proxyStartTime ? Date.now() - proxyStartTime : 0,
    }
  })

  router.get('/statistics', async (ctx) => {
    if (proxyServer) {
      ctx.body = proxyServer.getStatistics()
    } else {
      ctx.body = {
        totalRequests: 0,
        successRequests: 0,
        failedRequests: 0,
        avgLatency: 0,
        requestsPerMinute: 0,
        activeConnections: 0,
        modelUsage: {},
        providerUsage: {},
        accountUsage: {},
      }
    }
  })

  router.post('/reset-statistics', async (ctx) => {
    if (proxyServer) {
      proxyServer.resetStatistics()
    }
    ctx.body = { success: true }
  })

  return router
}
```

**创建文件**: `src/server/api/logs.ts`

```typescript
import Router from '@koa/router'
import { LogManager } from '../storage/logs'

export function createLogsRouter() {
  const router = new Router()

  router.get('/', async (ctx) => {
    const { level, limit = 100, offset = 0 } = ctx.query
    ctx.body = LogManager.get(
      Number(limit), 
      level === 'all' ? undefined : level as any,
      Number(offset)
    )
  })

  router.get('/stats', async (ctx) => {
    ctx.body = LogManager.getStats()
  })

  router.get('/trend', async (ctx) => {
    const { days = 7 } = ctx.query
    ctx.body = LogManager.getTrend(Number(days))
  })

  router.get('/account/:accountId/trend', async (ctx) => {
    const { days = 7 } = ctx.query
    ctx.body = LogManager.getAccountTrend(ctx.params.accountId, Number(days))
  })

  router.get('/:id', async (ctx) => {
    const log = LogManager.getById(ctx.params.id)
    if (!log) {
      ctx.status = 404
      ctx.body = { error: 'Log not found' }
      return
    }
    ctx.body = log
  })

  router.delete('/', async (ctx) => {
    LogManager.clear()
    ctx.body = { success: true }
  })

  router.get('/export', async (ctx) => {
    const { format = 'json' } = ctx.query
    ctx.body = { data: LogManager.export(format as any) }
  })

  return router
}
```

**创建文件**: `src/server/api/config.ts`

```typescript
import Router from '@koa/router'
import { ConfigManager } from '../storage/config'

export function createConfigRouter() {
  const router = new Router()

  router.get('/', async (ctx) => {
    ctx.body = ConfigManager.get()
  })

  router.put('/', async (ctx) => {
    ConfigManager.update(ctx.request.body as any)
    ctx.body = { success: true }
  })

  router.post('/reset', async (ctx) => {
    ctx.body = ConfigManager.reset()
  })

  return router
}
```

**创建文件**: `src/server/api/apikeys.ts`

```typescript
import Router from '@koa/router'
import { ConfigManager } from '../storage/config'
import crypto from 'crypto'

export function createApiKeysRouter() {
  const router = new Router()

  router.get('/', async (ctx) => {
    ctx.body = ConfigManager.getApiKeys()
  })

  router.post('/', async (ctx) => {
    const { name, description } = ctx.request.body as any
    const key = `sk-${crypto.randomBytes(24).toString('base64url')}`
    const apiKey = ConfigManager.addApiKey({ name, key, description })
    ctx.body = apiKey
  })

  router.put('/:id', async (ctx) => {
    const apiKey = ConfigManager.updateApiKey(ctx.params.id, ctx.request.body as any)
    if (!apiKey) {
      ctx.status = 404
      ctx.body = { error: 'API key not found' }
      return
    }
    ctx.body = apiKey
  })

  router.delete('/:id', async (ctx) => {
    const result = ConfigManager.deleteApiKey(ctx.params.id)
    ctx.body = { success: result }
  })

  return router
}
```

---

### 任务11: 创建前端API客户端

**创建文件**: `src/renderer/src/api/client.ts`

```typescript
import axios from 'axios'

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (error.response?.data?.needSetup) {
        window.location.hash = '/login'
      } else {
        window.location.hash = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default apiClient
```

**创建文件**: `src/renderer/src/api/websocket.ts`

```typescript
type MessageHandler = (data: unknown) => void

class WebSocketClient {
  private ws: WebSocket | null = null
  private handlers: Map<string, MessageHandler[]> = new Map()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  connect() {
    if (this.ws) return
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws`
    
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      console.log('WebSocket connected')
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
      }
    }

    this.ws.onmessage = (event) => {
      try {
        const { type, data } = JSON.parse(event.data)
        const handlers = this.handlers.get(type) || []
        handlers.forEach(h => h(data))
      } catch (e) {
        console.error('WebSocket parse error:', e)
      }
    }

    this.ws.onclose = () => {
      this.ws = null
      this.reconnectTimer = setTimeout(() => this.connect(), 3000)
    }
  }

  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, [])
    }
    this.handlers.get(type)!.push(handler)
    return () => {
      const handlers = this.handlers.get(type) || []
      const index = handlers.indexOf(handler)
      if (index > -1) handlers.splice(index, 1)
    }
  }
}

export const wsClient = new WebSocketClient()
```

**创建文件**: `src/renderer/src/api/index.ts`

```typescript
import apiClient from './client'
import { wsClient } from './websocket'

export { wsClient }

export const api = {
  auth: {
    status: () => apiClient.get('/auth/status').then(r => r.data),
    setup: (password: string) => apiClient.post('/auth/setup', { password }).then(r => r.data),
    login: (password: string) => apiClient.post('/auth/login', { password }).then(r => r.data),
    logout: () => apiClient.post('/auth/logout').then(r => r.data),
  },
  providers: {
    getAll: () => apiClient.get('/providers').then(r => r.data),
    getById: (id: string) => apiClient.get(`/providers/${id}`).then(r => r.data),
    getBuiltin: () => apiClient.get('/providers/builtin').then(r => r.data),
    add: (data: unknown) => apiClient.post('/providers', data).then(r => r.data),
    update: (id: string, data: unknown) => apiClient.put(`/providers/${id}`, data).then(r => r.data),
    delete: (id: string) => apiClient.delete(`/providers/${id}`).then(r => r.data),
    checkStatus: (id: string) => apiClient.get(`/providers/${id}/status`).then(r => r.data),
    checkAllStatus: () => apiClient.post('/providers/check-all').then(r => r.data),
    duplicate: (id: string) => apiClient.post(`/providers/${id}/duplicate`).then(r => r.data),
    export: (id: string) => apiClient.get(`/providers/${id}/export`).then(r => r.data),
    import: (data: string) => apiClient.post('/providers/import', { data }).then(r => r.data),
  },
  accounts: {
    getAll: (includeCredentials?: boolean) => 
      apiClient.get('/accounts', { params: { includeCredentials } }).then(r => r.data),
    getById: (id: string, includeCredentials?: boolean) => 
      apiClient.get(`/accounts/${id}`, { params: { includeCredentials } }).then(r => r.data),
    getByProvider: (providerId: string, includeCredentials?: boolean) => 
      apiClient.get(`/accounts/provider/${providerId}`, { params: { includeCredentials } }).then(r => r.data),
    add: (data: unknown) => apiClient.post('/accounts', data).then(r => r.data),
    update: (id: string, data: unknown) => apiClient.put(`/accounts/${id}`, data).then(r => r.data),
    delete: (id: string) => apiClient.delete(`/accounts/${id}`).then(r => r.data),
    validate: (id: string) => apiClient.post(`/accounts/${id}/validate`).then(r => r.data),
    validateToken: (providerId: string, credentials: Record<string, string>) =>
      apiClient.post('/accounts/validate-token', { providerId, credentials }).then(r => r.data),
    getCredits: (id: string) => apiClient.get(`/accounts/${id}/credits`).then(r => r.data),
  },
  proxy: {
    start: (port?: number) => apiClient.post('/proxy/start', { port }).then(r => r.data),
    stop: () => apiClient.post('/proxy/stop').then(r => r.data),
    getStatus: () => apiClient.get('/proxy/status').then(r => r.data),
    getStatistics: () => apiClient.get('/proxy/statistics').then(r => r.data),
    resetStatistics: () => apiClient.post('/proxy/reset-statistics').then(r => r.data),
  },
  logs: {
    get: (params?: { level?: string; limit?: number; offset?: number }) => 
      apiClient.get('/logs', { params }).then(r => r.data),
    getById: (id: string) => apiClient.get(`/logs/${id}`).then(r => r.data),
    getStats: () => apiClient.get('/logs/stats').then(r => r.data),
    getTrend: (days?: number) => apiClient.get('/logs/trend', { params: { days } }).then(r => r.data),
    getAccountTrend: (accountId: string, days?: number) => 
      apiClient.get(`/logs/account/${accountId}/trend`, { params: { days } }).then(r => r.data),
    clear: () => apiClient.delete('/logs').then(r => r.data),
    export: (format?: 'json' | 'txt') => 
      apiClient.get('/logs/export', { params: { format } }).then(r => r.data),
  },
  config: {
    get: () => apiClient.get('/config').then(r => r.data),
    update: (data: unknown) => apiClient.put('/config', data).then(r => r.data),
    reset: () => apiClient.post('/config/reset').then(r => r.data),
  },
  apiKeys: {
    getAll: () => apiClient.get('/api-keys').then(r => r.data),
    create: (data: { name: string; description?: string }) => 
      apiClient.post('/api-keys', data).then(r => r.data),
    update: (id: string, data: unknown) => apiClient.put(`/api-keys/${id}`, data).then(r => r.data),
    delete: (id: string) => apiClient.delete(`/api-keys/${id}`).then(r => r.data),
  },
}
```

---

### 任务12: 创建登录页面

**创建文件**: `src/renderer/src/pages/Login.tsx`

```typescript
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function Login() {
  const [password, setPassword] = useState('')
  const [isSetup, setIsSetup] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    api.auth.status().then((res) => {
      if (!res.hasPassword) {
        setIsSetup(true)
      }
    }).catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isSetup) {
        await api.auth.setup(password)
      } else {
        await api.auth.login(password)
      }
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>{isSetup ? 'Set Password' : 'Login'}</CardTitle>
          <CardDescription>
            {isSetup ? 'Create a password to protect your Chat2API' : 'Enter your password to continue'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Processing...' : (isSetup ? 'Set Password' : 'Login')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

---

### 任务13: 修改前端入口和路由

**修改文件**: `src/renderer/src/main.tsx`

将内容替换为：

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { ThemeProvider } from './components/ThemeProvider'
import './i18n'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
```

**修改文件**: `src/renderer/src/App.tsx`

将内容替换为：

```typescript
import { Routes, Route, Navigate } from 'react-router-dom'
import { MainLayout } from '@/components/layout/MainLayout'
import { Dashboard } from '@/pages/Dashboard'
import { Providers } from '@/pages/Providers'
import { ProxySettings } from '@/pages/ProxySettings'
import { Models } from '@/pages/Models'
import ApiKeys from '@/pages/ApiKeys'
import Logs from '@/pages/Logs'
import { Settings } from '@/pages/Settings'
import { About } from '@/pages/About'
import { Login } from '@/pages/Login'
import { Toaster } from '@/components/ui/toaster'

function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<MainLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/providers" element={<Providers />} />
          <Route path="/proxy" element={<ProxySettings />} />
          <Route path="/models" element={<Models />} />
          <Route path="/api-keys" element={<ApiKeys />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/about" element={<About />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  )
}

export default App
```

---

### 任务14: 修改Stores（替换electronAPI）

**修改文件**: `src/renderer/src/stores/providersStore.ts`

将所有 `window.electronAPI.xxx` 替换为 `api.xxx`：

```typescript
import { create } from 'zustand'
import { api } from '@/api'
import type { Provider, ProviderCheckResult } from '@/types/electron'

interface ProvidersState {
  providers: Provider[]
  builtinProviders: Provider[]
  loading: boolean
  error: string | null
  fetchProviders: () => Promise<void>
  fetchBuiltinProviders: () => Promise<void>
  addProvider: (data: unknown) => Promise<Provider | null>
  updateProvider: (id: string, data: Partial<Provider>) => Promise<Provider | null>
  deleteProvider: (id: string) => Promise<boolean>
  checkProviderStatus: (id: string) => Promise<ProviderCheckResult>
  checkAllStatus: () => Promise<Record<string, ProviderCheckResult>>
  duplicateProvider: (id: string) => Promise<Provider | null>
  exportProvider: (id: string) => Promise<string | null>
  importProvider: (data: string) => Promise<Provider | null>
}

export const useProvidersStore = create<ProvidersState>((set, get) => ({
  providers: [],
  builtinProviders: [],
  loading: false,
  error: null,

  fetchProviders: async () => {
    set({ loading: true, error: null })
    try {
      const providers = await api.providers.getAll()
      set({ providers, loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  fetchBuiltinProviders: async () => {
    try {
      const builtinProviders = await api.providers.getBuiltin()
      set({ builtinProviders })
    } catch (error: any) {
      console.error('Failed to fetch builtin providers:', error)
    }
  },

  addProvider: async (data) => {
    try {
      const provider = await api.providers.add(data)
      set({ providers: [...get().providers, provider] })
      return provider
    } catch (error: any) {
      set({ error: error.message })
      return null
    }
  },

  updateProvider: async (id, data) => {
    try {
      const provider = await api.providers.update(id, data)
      if (provider) {
        set({ providers: get().providers.map(p => p.id === id ? provider : p) })
      }
      return provider
    } catch (error: any) {
      set({ error: error.message })
      return null
    }
  },

  deleteProvider: async (id) => {
    try {
      const result = await api.providers.delete(id)
      if (result.success) {
        set({ providers: get().providers.filter(p => p.id !== id) })
      }
      return result.success
    } catch (error: any) {
      set({ error: error.message })
      return false
    }
  },

  checkProviderStatus: async (id) => {
    return await api.providers.checkStatus(id)
  },

  checkAllStatus: async () => {
    return await api.providers.checkAllStatus()
  },

  duplicateProvider: async (id) => {
    try {
      const provider = await api.providers.duplicate(id)
      if (provider) {
        set({ providers: [...get().providers, provider] })
      }
      return provider
    } catch (error: any) {
      set({ error: error.message })
      return null
    }
  },

  exportProvider: async (id) => {
    try {
      const result = await api.providers.export(id)
      return result.data
    } catch (error: any) {
      set({ error: error.message })
      return null
    }
  },

  importProvider: async (data) => {
    try {
      const provider = await api.providers.import(data)
      if (provider) {
        set({ providers: [...get().providers, provider] })
      }
      return provider
    } catch (error: any) {
      set({ error: error.message })
      return null
    }
  },
}))
```

**修改文件**: `src/renderer/src/stores/accountsStore.ts` (新建)

```typescript
import { create } from 'zustand'
import { api } from '@/api'
import type { Account } from '@/types/electron'

interface AccountsState {
  accounts: Account[]
  loading: boolean
  error: string | null
  fetchAccounts: (includeCredentials?: boolean) => Promise<void>
  fetchByProvider: (providerId: string, includeCredentials?: boolean) => Promise<void>
  addAccount: (data: unknown) => Promise<Account | null>
  updateAccount: (id: string, data: Partial<Account>) => Promise<Account | null>
  deleteAccount: (id: string) => Promise<boolean>
  validateAccount: (id: string) => Promise<{ valid: boolean; error?: string }>
  validateToken: (providerId: string, credentials: Record<string, string>) => Promise<any>
  getCredits: (id: string) => Promise<any>
}

export const useAccountsStore = create<AccountsState>((set, get) => ({
  accounts: [],
  loading: false,
  error: null,

  fetchAccounts: async (includeCredentials = false) => {
    set({ loading: true, error: null })
    try {
      const accounts = await api.accounts.getAll(includeCredentials)
      set({ accounts, loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  fetchByProvider: async (providerId, includeCredentials = false) => {
    set({ loading: true, error: null })
    try {
      const accounts = await api.accounts.getByProvider(providerId, includeCredentials)
      set({ accounts, loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  addAccount: async (data) => {
    try {
      const account = await api.accounts.add(data)
      set({ accounts: [...get().accounts, account] })
      return account
    } catch (error: any) {
      set({ error: error.message })
      return null
    }
  },

  updateAccount: async (id, data) => {
    try {
      const account = await api.accounts.update(id, data)
      if (account) {
        set({ accounts: get().accounts.map(a => a.id === id ? account : a) })
      }
      return account
    } catch (error: any) {
      set({ error: error.message })
      return null
    }
  },

  deleteAccount: async (id) => {
    try {
      const result = await api.accounts.delete(id)
      if (result.success) {
        set({ accounts: get().accounts.filter(a => a.id !== id) })
      }
      return result.success
    } catch (error: any) {
      set({ error: error.message })
      return false
    }
  },

  validateAccount: async (id) => {
    return await api.accounts.validate(id)
  },

  validateToken: async (providerId, credentials) => {
    return await api.accounts.validateToken(providerId, credentials)
  },

  getCredits: async (id) => {
    return await api.accounts.getCredits(id)
  },
}))
```

**修改文件**: `src/renderer/src/stores/proxyStore.ts`

```typescript
import { create } from 'zustand'
import { api, wsClient } from '@/api'
import type { ProxyStatus, ProxyStatistics } from '@/types/electron'

interface ProxyState {
  status: ProxyStatus
  statistics: ProxyStatistics
  loading: boolean
  startProxy: (port?: number) => Promise<boolean>
  stopProxy: () => Promise<boolean>
  fetchStatus: () => Promise<void>
  fetchStatistics: () => Promise<void>
  resetStatistics: () => Promise<void>
}

export const useProxyStore = create<ProxyState>((set) => ({
  status: { isRunning: false, port: 0, uptime: 0, connections: 0 },
  statistics: {
    totalRequests: 0,
    successRequests: 0,
    failedRequests: 0,
    avgLatency: 0,
    requestsPerMinute: 0,
    activeConnections: 0,
    modelUsage: {},
    providerUsage: {},
    accountUsage: {},
  },
  loading: false,

  startProxy: async (port) => {
    set({ loading: true })
    try {
      const result = await api.proxy.start(port)
      set({ loading: false })
      return result.success
    } catch {
      set({ loading: false })
      return false
    }
  },

  stopProxy: async () => {
    set({ loading: true })
    try {
      const result = await api.proxy.stop()
      set({ loading: false })
      return result.success
    } catch {
      set({ loading: false })
      return false
    }
  },

  fetchStatus: async () => {
    try {
      const status = await api.proxy.getStatus()
      set({ status })
    } catch (error) {
      console.error('Failed to fetch proxy status:', error)
    }
  },

  fetchStatistics: async () => {
    try {
      const statistics = await api.proxy.getStatistics()
      set({ statistics })
    } catch (error) {
      console.error('Failed to fetch statistics:', error)
    }
  },

  resetStatistics: async () => {
    try {
      await api.proxy.resetStatistics()
      const statistics = await api.proxy.getStatistics()
      set({ statistics })
    } catch (error) {
      console.error('Failed to reset statistics:', error)
    }
  },
}))

wsClient.on('proxy:status', (data) => {
  useProxyStore.setState({ status: data as ProxyStatus })
})
```

**修改文件**: `src/renderer/src/stores/logsStore.ts`

```typescript
import { create } from 'zustand'
import { api, wsClient } from '@/api'
import type { LogEntry, LogLevel } from '@/types/electron'

interface LogFilter {
  level: LogLevel | 'all'
  keyword: string
  startTime?: number
  endTime?: number
}

interface LogStats {
  total: number
  info: number
  warn: number
  error: number
  debug: number
}

interface LogTrend {
  date: string
  total: number
  info: number
  warn: number
  error: number
}

interface LogsState {
  logs: LogEntry[]
  filteredLogs: LogEntry[]
  selectedLog: LogEntry | null
  filter: LogFilter
  stats: LogStats
  trend: LogTrend[]
  isLoading: boolean
  autoScroll: boolean
  hasMore: boolean
  pageSize: number

  setLogs: (logs: LogEntry[]) => void
  addLog: (log: LogEntry) => void
  setSelectedLog: (log: LogEntry | null) => void
  setFilter: (filter: Partial<LogFilter>) => void
  setStats: (stats: LogStats) => void
  setTrend: (trend: LogTrend[]) => void
  setIsLoading: (loading: boolean) => void
  setAutoScroll: (autoScroll: boolean) => void
  setHasMore: (hasMore: boolean) => void
  applyFilter: () => void
  clearLogs: () => Promise<void>
  loadMore: () => Promise<void>
  refresh: () => Promise<void>
  exportLogs: (format: 'json' | 'txt') => Promise<string>
  fetchTrend: (days?: number) => Promise<void>
  fetchAccountTrend: (accountId: string, days?: number) => Promise<void>
}

export const useLogsStore = create<LogsState>((set, get) => ({
  logs: [],
  filteredLogs: [],
  selectedLog: null,
  filter: {
    level: 'all',
    keyword: '',
  },
  stats: {
    total: 0,
    info: 0,
    warn: 0,
    error: 0,
    debug: 0,
  },
  trend: [],
  isLoading: false,
  autoScroll: true,
  hasMore: true,
  pageSize: 100,

  setLogs: (logs) => {
    set({ logs, hasMore: logs.length >= get().pageSize })
    get().applyFilter()
  },

  addLog: (log) => {
    const { logs, autoScroll, filter } = get()
    const newLogs = [log, ...logs].slice(0, 10000)
    set({ logs: newLogs })
    
    if (autoScroll) {
      let shouldAdd = true
      if (filter.level !== 'all' && log.level !== filter.level) {
        shouldAdd = false
      }
      if (filter.keyword && !log.message.toLowerCase().includes(filter.keyword.toLowerCase())) {
        shouldAdd = false
      }
      
      if (shouldAdd) {
        set({ filteredLogs: [log, ...get().filteredLogs].slice(0, 10000) })
      }
    }

    set((state) => ({
      stats: {
        ...state.stats,
        total: state.stats.total + 1,
        [log.level]: state.stats[log.level] + 1,
      },
    }))
  },

  setSelectedLog: (log) => set({ selectedLog: log }),

  setFilter: (filter) => {
    set((state) => ({ filter: { ...state.filter, ...filter } }))
    get().applyFilter()
  },

  setStats: (stats) => set({ stats }),

  setTrend: (trend) => set({ trend }),

  setIsLoading: (isLoading) => set({ isLoading }),

  setAutoScroll: (autoScroll) => set({ autoScroll }),

  setHasMore: (hasMore) => set({ hasMore }),

  applyFilter: () => {
    const { logs, filter } = get()
    let filtered = [...logs]

    if (filter.level !== 'all') {
      filtered = filtered.filter((log) => log.level === filter.level)
    }

    if (filter.keyword) {
      const keyword = filter.keyword.toLowerCase()
      filtered = filtered.filter((log) =>
        log.message.toLowerCase().includes(keyword)
      )
    }

    set({ filteredLogs: filtered })
  },

  clearLogs: async () => {
    await api.logs.clear()
    set({
      logs: [],
      filteredLogs: [],
      selectedLog: null,
      stats: { total: 0, info: 0, warn: 0, error: 0, debug: 0 },
      hasMore: false,
    })
  },

  loadMore: async () => {
    const { isLoading, hasMore, logs, pageSize } = get()
    if (isLoading || !hasMore) return

    set({ isLoading: true })

    try {
      const offset = logs.length
      const newLogs = await api.logs.get({ limit: pageSize, offset })

      if (newLogs.length < pageSize) {
        set({ hasMore: false })
      }

      if (newLogs.length > 0) {
        set((state) => ({ logs: [...state.logs, ...newLogs] }))
        get().applyFilter()
      }
    } catch (error) {
      console.error('Failed to load more logs:', error)
    } finally {
      set({ isLoading: false })
    }
  },

  refresh: async () => {
    const { pageSize } = get()
    set({ isLoading: true })

    try {
      const [logs, stats] = await Promise.all([
        api.logs.get({ limit: pageSize }),
        api.logs.getStats(),
      ])

      set({
        logs,
        stats,
        hasMore: logs.length >= pageSize,
      })
      get().applyFilter()
    } catch (error) {
      console.error('Failed to refresh logs:', error)
    } finally {
      set({ isLoading: false })
    }
  },

  exportLogs: async (format) => {
    const result = await api.logs.export(format)
    return result.data
  },

  fetchTrend: async (days = 7) => {
    try {
      const trend = await api.logs.getTrend(days)
      set({ trend })
    } catch (error) {
      console.error('Failed to fetch trend:', error)
    }
  },

  fetchAccountTrend: async (accountId, days = 7) => {
    try {
      const trend = await api.logs.getAccountTrend(accountId, days)
      set({ trend })
    } catch (error) {
      console.error('Failed to fetch account trend:', error)
    }
  },
}))

wsClient.on('log:new', (log) => {
  useLogsStore.getState().addLog(log as LogEntry)
})

export type { LogFilter, LogStats, LogTrend }
```

**修改文件**: `src/renderer/src/stores/settingsStore.ts`

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '@/api'
import type { AppConfig } from '@/types/electron'
import i18n from '@/i18n'

export type Theme = 'light' | 'dark' | 'system'
export type Language = 'zh-CN' | 'en-US'

interface SettingsState {
  theme: Theme
  setTheme: (theme: Theme) => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  language: Language
  setLanguage: (language: Language) => void
  config: AppConfig | null
  setConfig: (config: AppConfig) => void
  updateConfig: (updates: Partial<AppConfig>) => Promise<void>
  fetchConfig: () => Promise<void>
  resetConfig: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      language: 'en-US',
      setLanguage: (language) => {
        set({ language })
        i18n.changeLanguage(language)
      },
      config: null,
      setConfig: (config) => set({ config }),
      updateConfig: async (updates) => {
        const currentConfig = get().config
        if (!currentConfig) return
        
        const newConfig = { ...currentConfig, ...updates }
        set({ config: newConfig })
        
        try {
          await api.config.update(updates)
        } catch (error) {
          console.error('Failed to update config:', error)
          set({ config: currentConfig })
        }
      },
      fetchConfig: async () => {
        try {
          const config = await api.config.get()
          set({ config })
        } catch (error) {
          console.error('Failed to fetch config:', error)
        }
      },
      resetConfig: async () => {
        try {
          const config = await api.config.reset()
          set({ config })
        } catch (error) {
          console.error('Failed to reset config:', error)
        }
      },
    }),
    {
      name: 'chat2api-settings',
      onRehydrateStorage: () => (state) => {
        if (state?.language) {
          i18n.changeLanguage(state.language)
        }
      },
    }
  )
)
```

---

### 任务15: 修改布局组件

**修改文件**: `src/renderer/src/components/layout/Header.tsx`

将 `window.electronAPI.proxy.xxx` 替换为 `api.proxy.xxx`：

```typescript
import { useTranslation } from 'react-i18next'
import { Sun, Moon, Languages, Play, Pause } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'
import logoIcon from '@/assets/icons/icons.png'
import { useEffect, useState } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { api, wsClient } from '@/api'

export function Header() {
  const { t } = useTranslation()
  const { toggleTheme, isDark } = useTheme()
  const { language, setLanguage } = useSettingsStore()
  const [proxyEnabled, setProxyEnabled] = useState(false)
  const [proxyLoading, setProxyLoading] = useState(false)
  const [port, setPort] = useState(8310)

  useEffect(() => {
    api.proxy.getStatus().then((status) => {
      setProxyEnabled(status.isRunning)
      if (status.port) setPort(status.port)
    }).catch(() => {})

    const unsubscribe = wsClient.on('proxy:status', (status: any) => {
      setProxyEnabled(status.isRunning)
      if (status.port) setPort(status.port)
    })

    return () => unsubscribe()
  }, [])

  const handleToggleProxy = async () => {
    if (proxyLoading) return
    setProxyLoading(true)
    try {
      if (proxyEnabled) {
        await api.proxy.stop()
        setProxyEnabled(false)
      } else {
        const result = await api.proxy.start()
        if (result.success) {
          setProxyEnabled(true)
          setPort(result.port || 8310)
        }
      }
    } finally {
      setProxyLoading(false)
    }
  }

  const toggleLanguage = () => {
    setLanguage(language === 'zh-CN' ? 'en-US' : 'zh-CN')
  }

  return (
    <header className="glass-topbar flex items-center justify-between px-4 h-12">
      <div className="flex items-center gap-3">
        <div className="sidebar-logo-icon">
          <img 
            src={logoIcon} 
            alt="Chat2API" 
            className="h-7 w-7 object-contain"
          />
        </div>
        <div className="flex flex-col">
          <span className="text-base font-bold text-[var(--text-primary)] leading-tight">
            Chat2API
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={toggleTheme}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-300 group"
          title={isDark ? t('settings.themeLight') : t('settings.themeDark')}
        >
          {isDark ? (
            <Sun className="h-4 w-4 text-[var(--text-primary)] group-hover:text-[var(--accent-primary)]" />
          ) : (
            <Moon className="h-4 w-4 text-[var(--text-primary)] group-hover:text-[var(--accent-primary)]" />
          )}
        </button>

        <button
          onClick={toggleLanguage}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-300 group"
          title={language === 'zh-CN' ? t('header.switchToEnglish') : t('header.switchToChinese')}
        >
          <Languages className="h-4 w-4 text-[var(--text-primary)] group-hover:text-[var(--accent-primary)]" />
        </button>

        <div className="flex items-center">
          <div
            className={cn(
              "flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full transition-all duration-300",
              "border",
              proxyEnabled
                ? "proxy-toggle-active"
                : "bg-[var(--glass-bg)] border-[var(--glass-border)]"
            )}
          >
            <div
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-all duration-300",
                proxyLoading
                  ? "bg-[var(--warning)] animate-pulse"
                  : proxyEnabled
                    ? "bg-[var(--accent-primary)] shadow-[0_0_6px_var(--accent-primary)]"
                    : "bg-[var(--text-dim)]"
              )}
            />
            <span
              className={cn(
                "text-xs font-medium transition-colors duration-300",
                proxyEnabled
                  ? "text-[var(--accent-primary)]"
                  : "text-[var(--text-muted)]"
              )}
            >
              127.0.0.1:{port}
            </span>
            <button
              onClick={handleToggleProxy}
              disabled={proxyLoading}
              className={cn(
                "w-6 h-6 flex items-center justify-center rounded-full transition-all duration-200",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                proxyEnabled
                  ? "proxy-toggle-btn-active"
                  : "bg-[var(--text-dim)]/10 text-[var(--text-secondary)]"
              )}
              title={proxyEnabled ? t('proxyStatus.stop') : t('proxyStatus.start')}
            >
              {proxyLoading ? (
                <span className="text-[10px]">...</span>
              ) : proxyEnabled ? (
                <Pause className="h-3 w-3" />
              ) : (
                <Play className="h-3 w-3" />
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
```

---

### 任务16: 创建代理服务适配层

**创建文件**: `src/server/proxy/storeAdapter.ts`

为proxy模块提供存储适配，替换对 `storeManager` 的依赖：

```typescript
import { ConfigManager } from '../storage/config'
import { LogManager } from '../storage/logs'
import { AccountManager } from '../storage/accounts'
import { ProviderManager } from '../storage/providers'
import { decryptCredentials } from '../storage/sqlite'

export const storeAdapter = {
  getConfig: () => ConfigManager.get(),
  
  updateConfig: (updates: Record<string, any>) => {
    ConfigManager.update(updates)
  },
  
  addLog: (level: string, message: string, data?: any) => {
    LogManager.add({
      level: level as any,
      message,
      timestamp: Date.now(),
      accountId: data?.accountId,
      providerId: data?.providerId,
      requestId: data?.requestId,
      data: data?.data,
    })
  },

  getProviders: () => ProviderManager.getAll(),
  
  getProviderById: (id: string) => ProviderManager.getById(id),
  
  getAccounts: (includeCredentials: boolean = false) => 
    AccountManager.getAll(includeCredentials),
  
  getAccountsByProviderId: (providerId: string, includeCredentials: boolean = false) =>
    AccountManager.getByProviderId(providerId, includeCredentials),
  
  getActiveAccounts: (includeCredentials: boolean = false) =>
    AccountManager.getActiveAccounts(includeCredentials),
  
  getAccountById: (id: string, includeCredentials: boolean = false) =>
    AccountManager.getById(id, includeCredentials),
  
  incrementRequestCount: (id: string) =>
    AccountManager.incrementRequestCount(id),

  decryptCredentials,
}
```

**修改文件**: `src/main/proxy/server.ts`

修改import语句，使用适配器：

```typescript
import { storeAdapter as storeManager } from '../../server/proxy/storeAdapter'
```

---

### 任务17: 修改Vite配置

**修改文件**: `vite.renderer.config.ts`

添加开发服务器代理：

```typescript
import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
})
```

---

### 任务18: 创建Dockerfile

**创建文件**: `Dockerfile.web`

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build:web

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --production

COPY --from=builder /app/dist ./dist
COPY src/server ./src/server
COPY src/main/proxy ./src/main/proxy
COPY src/main/providers ./src/main/providers
COPY src/shared ./src/shared

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV PROXY_PORT=8310
ENV SECRET_KEY=change-this-in-production

EXPOSE 3000 8310

CMD ["npx", "tsx", "src/server/index.ts"]
```

**创建文件**: `docker-compose.yml`

```yaml
version: '3.8'

services:
  chat2api:
    build:
      context: .
      dockerfile: Dockerfile.web
    ports:
      - "3000:3000"
      - "8310:8310"
    volumes:
      - ./data:/app/data
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3000
      - PROXY_PORT=8310
      - SECRET_KEY=${SECRET_KEY:-change-this-in-production}
```

---

### 任务19: 更新package.json

**修改文件**: `package.json`

添加以下内容：

```json
{
  "scripts": {
    "dev:web": "concurrently \"npm run dev:server\" \"npm run dev:frontend\"",
    "dev:server": "tsx watch src/server/index.ts",
    "dev:frontend": "vite --config vite.renderer.config.ts",
    "build:web": "vite build --config vite.renderer.config.ts --outDir dist/web",
    "start:web": "npx tsx src/server/index.ts",
    "docker:build": "docker build -f Dockerfile.web -t chat2api .",
    "docker:run": "docker-compose up -d"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "koa-static": "^5.0.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "concurrently": "^8.2.0",
    "tsx": "^4.19.0",
    "@types/koa-static": "^4.0.7",
    "@types/better-sqlite3": "^7.6.11",
    "@types/ws": "^8.5.13"
  }
}
```

---

## 三、执行顺序

```
任务1 (SQLite存储层 + AES加密)
    ↓
任务2-5 (存储管理器: providers, accounts, config, logs)
    ↓
任务6 (内置提供商配置)
    ↓
任务7 (认证中间件) ──→ 任务12 (登录页面)
    ↓                      ↓
任务8-9 (后端入口 + WebSocket) ←─────────┘
    ↓
任务10-11 (API路由: 完整版)
    ↓
任务13 (前端API客户端)
    ↓
任务14 (前端入口修改)
    ↓
任务15 (修改Stores: providers, accounts, proxy, logs, settings)
    ↓
任务16 (修改Header)
    ↓
任务17 (代理服务适配层) ──→ 修改proxy/server.ts
    ↓
任务18 (Vite配置)
    ↓
任务19 (Dockerfile)
    ↓
任务20 (package.json)
```

---

## 四、验收检查

### 检查点1: 本地开发
```bash
npm install
npm run dev:web
```
- 访问 http://localhost:3000 显示登录页
- 设置密码后进入主界面
- 提供商管理正常（手动输入Token）
- 代理启动/停止正常

### 检查点2: Docker部署
```bash
npm run docker:build
npm run docker:run
```
- 访问 http://localhost:3000 正常
- 数据持久化到 ./data 目录

### 检查点3: 功能验证
- 密码认证正常
- 提供商管理正常（仅支持Token手动输入）
- 账户管理正常
- 代理服务正常
- 日志记录正常
- API Key管理正常

---

## 五、文件清单

### 新建文件 (25个)
| 文件路径 | 说明 |
|----------|------|
| src/server/index.ts | 后端入口 |
| src/server/websocket.ts | WebSocket模块 |
| src/server/storage/sqlite.ts | SQLite存储 + AES加密 |
| src/server/storage/providers.ts | 提供商存储 |
| src/server/storage/accounts.ts | 账户存储 |
| src/server/storage/config.ts | 配置存储 |
| src/server/storage/logs.ts | 日志存储 |
| src/server/storage/builtin.ts | 内置提供商配置 |
| src/server/middleware/auth.ts | 认证中间件 |
| src/server/api/index.ts | 路由注册 |
| src/server/api/auth.ts | 认证API |
| src/server/api/providers.ts | 提供商API |
| src/server/api/accounts.ts | 账户API |
| src/server/api/proxy.ts | 代理API |
| src/server/api/logs.ts | 日志API |
| src/server/api/config.ts | 配置API |
| src/server/api/apikeys.ts | API Key管理 |
| src/server/proxy/storeAdapter.ts | 代理存储适配器 |
| src/renderer/src/api/client.ts | API客户端 |
| src/renderer/src/api/websocket.ts | WebSocket客户端 |
| src/renderer/src/api/index.ts | API导出 |
| src/renderer/src/pages/Login.tsx | 登录页面 |
| src/renderer/src/stores/accountsStore.ts | 账户Store |
| Dockerfile.web | Docker构建 |
| docker-compose.yml | 容器编排 |

### 修改文件 (10个)
| 文件路径 | 修改内容 |
|----------|----------|
| src/renderer/src/main.tsx | 保持HashRouter |
| src/renderer/src/App.tsx | 添加登录路由 |
| src/renderer/src/stores/providersStore.ts | 替换electronAPI |
| src/renderer/src/stores/proxyStore.ts | 替换electronAPI |
| src/renderer/src/stores/logsStore.ts | 替换electronAPI |
| src/renderer/src/stores/settingsStore.ts | 替换electronAPI |
| src/renderer/src/components/layout/Header.tsx | 替换electronAPI |
| src/main/proxy/server.ts | 替换storeManager引用 |
| vite.renderer.config.ts | 添加代理配置 |
| package.json | 添加脚本和依赖 |

### 复用文件 (无需修改)
- src/renderer/src/components/ui/* (全部)
- src/renderer/src/components/dashboard/* (全部)
- src/renderer/src/hooks/* (全部)
- src/renderer/src/lib/* (全部)
- src/renderer/src/i18n/* (全部)
- src/main/providers/* (全部)
- src/main/proxy/adapters/* (全部)
- src/main/proxy/routes/* (全部)
- src/shared/types.ts (全部)

---

## 六、重要说明

### OAuth登录功能已移除
由于Web端无法使用Electron的BrowserWindow进行OAuth登录，本方案已移除OAuth功能，仅保留**手动输入Token**方式添加账户。

### 加密方案变更
- 原方案：Electron safeStorage（不可用）
- 新方案：AES-256-GCM（需要设置SECRET_KEY环境变量）

### 环境变量
生产环境必须设置以下环境变量：
```bash
SECRET_KEY=your-secret-key-here
SECRET_SALT=your-salt-here
```
