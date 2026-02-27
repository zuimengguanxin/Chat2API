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
