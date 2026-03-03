// Re-export all types from shared module for compatibility
export type {
  AccountStatus,
  ProviderStatus,
  ProviderType,
  AuthType,
  LoadBalanceStrategy,
  Theme,
  LogLevel,
} from '@shared/types'

export type {
  Account,
  Provider,
  ModelMapping,
  ApiKey,
  AppConfig,
  LogEntry,
  ProxyStatus,
  ProxyStatistics,
  ProviderCheckResult,
  CredentialField,
  BuiltinProviderConfig,
  ValidationResult,
} from '@shared/types'

export type ProviderVendor =
  | 'deepseek'
  | 'glm'
  | 'kimi'
  | 'minimax'
  | 'qwen'
  | 'qwen-ai'
  | 'zai'
  | 'custom'
