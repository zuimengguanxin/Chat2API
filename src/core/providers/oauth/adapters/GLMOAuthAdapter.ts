import type { OAuthAdapter, OAuthConfig, OAuthTokenResponse } from '../types'
import { ProviderVendor } from '../../../../shared/types'

export class GLMOAuthAdapter implements OAuthAdapter {
  providerType: ProviderVendor = 'glm'

  getAuthUrl(config: OAuthConfig): string {
    return `https://chatglm.cn/login`
  }

  async extractTokens(url: string): Promise<OAuthTokenResponse> {
    try {
      const urlObj = new URL(url)
      const refreshToken = urlObj.searchParams.get('refresh_token')

      if (refreshToken) {
        return {
          refresh_token: refreshToken,
          token_type: 'Bearer',
        }
      }

      return {
        error: 'No token found in callback',
        error_description: 'Could not extract token from callback URL',
      }
    } catch (error) {
      return {
        error: 'Invalid callback URL',
        error_description: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokenResponse> {
    try {
      const response = await fetch('https://chatglm.cn/chatglm/user-api/user/refresh', {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${refreshToken}`,
        },
      })

      const data = await response.json()

      if (data?.result?.access_token) {
        return {
          access_token: data.result.access_token,
          refresh_token: data.result.refresh_token || refreshToken,
          expires_in: data.result.expires_in,
          token_type: 'Bearer',
        }
      }

      return {
        error: data?.message || 'Refresh failed',
        error_description: 'Failed to refresh token',
      }
    } catch (error) {
      return {
        error: 'Refresh failed',
        error_description: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async getUserInfo(accessToken: string): Promise<any> {
    try {
      const response = await fetch('https://chatglm.cn/chatglm/user-api/user/info', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (data?.result) {
        return {
          id: data.result?.id,
          name: data.result?.name,
          email: data.result?.email,
        }
      }

      throw new Error('Failed to fetch user info')
    } catch (error) {
      throw new Error(`User info fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
