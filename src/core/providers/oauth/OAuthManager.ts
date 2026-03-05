import crypto from 'crypto'
import type {
  OAuthConfig,
  OAuthSession,
  OAuthResult,
  OAuthAdapter,
} from './types'
import {
  DeepSeekOAuthAdapter,
  GLMOAuthAdapter,
  KimiOAuthAdapter,
  MiniMaxOAuthAdapter,
  QwenOAuthAdapter,
  ZaiOAuthAdapter,
} from './adapters'

interface OAuthManagerConfig {
  callbackUrl: string
  sessionExpiry?: number
}

export class OAuthManager {
  private sessions: Map<string, OAuthSession> = new Map()
  private adapters: Map<string, OAuthAdapter> = new Map()
  private config: OAuthManagerConfig

  constructor(config: OAuthManagerConfig) {
    this.config = {
      ...config,
      sessionExpiry: config.sessionExpiry || 5 * 60 * 1000, // 5 minutes
    }

    // Initialize adapters
    const adapters = [
      new DeepSeekOAuthAdapter(),
      new GLMOAuthAdapter(),
      new KimiOAuthAdapter(),
      new MiniMaxOAuthAdapter(),
      new QwenOAuthAdapter(),
      new ZaiOAuthAdapter(),
    ]

    adapters.forEach(adapter => {
      this.adapters.set(adapter.providerType, adapter)
    })
  }

  /**
   * Start OAuth flow by creating a session and returning auth URL
   */
  startOAuthFlow(providerId: string, providerType: string): {
    state: string
    authUrl: string
    redirectUri: string
  } | null {
    const adapter = this.adapters.get(providerType)
    if (!adapter) {
      console.error(`[OAuthManager] No adapter found for provider: ${providerType}`)
      return null
    }

    const state = this.generateState()
    const redirectUri = this.config.callbackUrl

    const session: OAuthSession = {
      state,
      providerId,
      providerType: providerType as any,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.sessionExpiry!,
      redirectUri,
    }

    this.sessions.set(state, session)

    const authUrl = adapter.getAuthUrl({
      providerId,
      providerType: providerType as any,
      redirectUri,
      state,
    })

    return {
      state,
      authUrl,
      redirectUri,
    }
  }

  /**
   * Handle OAuth callback
   */
  async handleCallback(
    state: string,
    callbackUrl: string
  ): Promise<OAuthResult> {
    const session = this.sessions.get(state)
    if (!session) {
      return {
        success: false,
        providerId: '',
        error: 'Invalid or expired session',
      }
    }

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(state)
      return {
        success: false,
        providerId: session.providerId,
        error: 'Session expired',
      }
    }

    const adapter = this.adapters.get(session.providerType)
    if (!adapter) {
      return {
        success: false,
        providerId: session.providerId,
        error: 'No adapter found for provider',
      }
    }

    try {
      // Extract tokens from callback URL
      const tokenResponse = await adapter.extractTokens(callbackUrl)

      if (tokenResponse.error) {
        return {
          success: false,
          providerId: session.providerId,
          error: tokenResponse.error_description || tokenResponse.error,
        }
      }

      // Get user info if adapter supports it
      let userInfo: any = undefined
      const token = tokenResponse.access_token || tokenResponse.tongyi_sso_ticket || tokenResponse.refresh_token

      if (token && adapter.getUserInfo) {
        try {
          userInfo = await adapter.getUserInfo(token)
        } catch (error) {
          console.warn('[OAuthManager] Failed to fetch user info:', error)
        }
      }

      // Transform token response to credentials
      const credentials: Record<string, string> = {}

      if (tokenResponse.access_token) {
        credentials.access_token = tokenResponse.access_token
      }
      if (tokenResponse.refresh_token) {
        credentials.refresh_token = tokenResponse.refresh_token
      }
      if (tokenResponse.tongyi_sso_ticket) {
        credentials.ticket = tokenResponse.tongyi_sso_ticket
      }
      if ((tokenResponse as any).real_user_id) {
        credentials.realUserID = (tokenResponse as any).real_user_id
      }

      // Map credentials based on provider
      this.mapCredentials(session.providerType, credentials)

      this.sessions.delete(state)

      return {
        success: true,
        providerId: session.providerId,
        credentials,
        userInfo: userInfo ? {
          name: userInfo.name,
          email: userInfo.email,
          userId: userInfo.id,
        } : undefined,
      }
    } catch (error) {
      return {
        success: false,
        providerId: session.providerId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Extract credentials directly from browser data (for web-based OAuth)
   */
  async extractCredentialsFromBrowserData(providerType: string, data: {
    token?: string
    refreshToken?: string
    ticket?: string
    realUserID?: string
    cookies?: string
    [key: string]: any
  }): Promise<OAuthResult> {
    const adapter = this.adapters.get(providerType)
    if (!adapter) {
      return {
        success: false,
        providerId: '',
        error: 'No adapter found for provider',
      }
    }

    try {
      // Get user info if possible
      let userInfo: any = undefined
      const token = data.token || data.ticket || data.refreshToken

      if (token && adapter.getUserInfo) {
        try {
          userInfo = await adapter.getUserInfo(token)
        } catch (error) {
          console.warn('[OAuthManager] Failed to fetch user info:', error)
        }
      }

      // Transform data to credentials
      const credentials: Record<string, string> = {}

      if (data.token) {
        credentials.access_token = data.token
      }
      if (data.refreshToken) {
        credentials.refresh_token = data.refreshToken
      }
      if (data.ticket) {
        credentials.ticket = data.ticket
      }
      if (data.realUserID) {
        credentials.realUserID = data.realUserID
      }
      if (data.cookies) {
        credentials.cookies = data.cookies
      }

      // Map credentials based on provider
      this.mapCredentials(providerType, credentials)

      return {
        success: true,
        providerId: providerType,
        credentials,
        userInfo: userInfo ? {
          name: userInfo.name,
          email: userInfo.email,
          userId: userInfo.id,
        } : undefined,
      }
    } catch (error) {
      return {
        success: false,
        providerId: providerType,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Map credentials to provider-specific field names
   */
  private mapCredentials(providerType: string, credentials: Record<string, string>): void {
    switch (providerType) {
      case 'deepseek':
        if (credentials.access_token) {
          credentials.token = credentials.access_token
          delete credentials.access_token
        }
        break

      case 'glm':
        if (credentials.refresh_token) {
          credentials.refresh_token = credentials.refresh_token
          delete credentials.access_token
        }
        break

      case 'kimi':
        if (credentials.access_token) {
          credentials.token = credentials.access_token
          delete credentials.access_token
        }
        break

      case 'minimax':
        if (credentials.access_token) {
          credentials.token = credentials.access_token
          delete credentials.access_token
        }
        break

      case 'qwen':
        if (credentials.ticket) {
          // Keep as ticket
        }
        break

      case 'zai':
        if (credentials.access_token) {
          credentials.token = credentials.access_token
          delete credentials.access_token
        }
        break
    }
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): void {
    const now = Date.now()
    for (const [state, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(state)
      }
    }
  }

  /**
   * Get session by state
   */
  getSession(state: string): OAuthSession | undefined {
    return this.sessions.get(state)
  }

  /**
   * Remove session by state
   */
  removeSession(state: string): boolean {
    return this.sessions.delete(state)
  }

  /**
   * Generate random state for OAuth flow
   */
  private generateState(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  /**
   * Start periodic cleanup
   */
  startCleanup(interval: number = 60000): void {
    setInterval(() => {
      this.cleanupExpiredSessions()
    }, interval)
  }
}

// Singleton instance
let oauthManager: OAuthManager | null = null

/**
 * Get or create OAuth manager singleton
 */
export function getOAuthManager(): OAuthManager {
  if (!oauthManager) {
    const baseUrl = process.env.OAUTH_CALLBACK_URL || 'http://localhost:3000'
    oauthManager = new OAuthManager({
      callbackUrl: `${baseUrl}/api/oauth/callback`,
    })
    oauthManager.startCleanup()
  }
  return oauthManager
}

/**
 * Initialize OAuth manager with custom config
 */
export function initOAuthManager(config: OAuthManagerConfig): OAuthManager {
  oauthManager = new OAuthManager(config)
  oauthManager.startCleanup()
  return oauthManager
}
