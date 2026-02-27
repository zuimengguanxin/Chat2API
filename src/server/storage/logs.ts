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
