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
