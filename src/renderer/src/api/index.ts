import apiClient from './client'
import { wsClient } from './websocket'

export { wsClient }

export const api = {
  auth: {
    status: () => apiClient.get('/auth/status').then(r => r.data),
    verify: () => apiClient.get('/auth/verify').then(r => r.data),
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
  oauth: {
    start: (providerId: string, providerType: string) =>
      apiClient.get('/oauth/start', { params: { providerId, providerType } }).then(r => r.data),
    getSession: (state: string) =>
      apiClient.get(`/oauth/session/${state}`).then(r => r.data),
    cancelSession: (state: string) =>
      apiClient.delete(`/oauth/session/${state}`).then(r => r.data),
    extractCredentials: (providerType: string, data: Record<string, string>) =>
      apiClient.post('/oauth/extract', { providerType, data }).then(r => r.data),
  },
}
