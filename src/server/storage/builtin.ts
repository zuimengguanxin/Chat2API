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
