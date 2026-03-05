import type { ProviderVendor } from '../../../shared/types'

export interface OAuthConfig {
  providerId: string
  providerType: ProviderVendor
  clientId?: string
  redirectUri: string
  scopes?: string[]
  state: string
}

export interface OAuthTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  error?: string
  error_description?: string
  user?: {
    id?: string
    name?: string
    email?: string
  }
  [key: string]: any
}

export interface OAuthAdapter {
  providerType: ProviderVendor
  getAuthUrl(config: OAuthConfig): string
  extractTokens(url: string): Promise<OAuthTokenResponse>
  refreshToken?(refreshToken: string): Promise<OAuthTokenResponse>
  getUserInfo?(accessToken: string): Promise<any>
}

export interface OAuthSession {
  state: string
  providerId: string
  providerType: ProviderVendor
  createdAt: number
  expiresAt: number
  redirectUri: string
}

export interface OAuthResult {
  success: boolean
  providerId: string
  credentials: Record<string, string>
  userInfo?: {
    name?: string
    email?: string
    userId?: string
  }
  error?: string
}
