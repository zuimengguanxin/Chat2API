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
