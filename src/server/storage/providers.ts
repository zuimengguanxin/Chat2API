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
