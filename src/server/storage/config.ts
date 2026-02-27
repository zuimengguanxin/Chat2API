import { getDb } from './sqlite'
import type { AppConfig, ApiKey } from '../../shared/types'

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
