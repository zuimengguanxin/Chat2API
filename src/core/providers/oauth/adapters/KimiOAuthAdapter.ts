import type { OAuthAdapter, OAuthConfig, OAuthTokenResponse } from '../types'
import { ProviderVendor } from '../../../../shared/types'

export class KimiOAuthAdapter implements OAuthAdapter {
  providerType: ProviderVendor = 'kimi'

  getAuthUrl(config: OAuthConfig): string {
    return `https://www.kimi.com/login`
  }

  async extractTokens(url: string): Promise<OAuthTokenResponse> {
    try {
      const urlObj = new URL(url)
      const token = urlObj.searchParams.get('token')
      const refreshToken = urlObj.searchParams.get('refresh_token')

      if (token) {
        return {
          access_token: token,
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
      const response = await fetch('https://www.kimi.com/api/v1/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })

      const data = await response.json()

      if (data?.access_token) {
        return {
          access_token: data.access_token,
          refresh_token: data.refresh_token || refreshToken,
          expires_in: data.expires_in,
          token_type: 'Bearer',
        }
      }

      return {
        error: data?.error || 'Refresh failed',
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
      const response = await fetch('https://www.kimi.com/api/v1/user/info', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (data?.data) {
        return {
          id: data.data?.userId,
          name: data.data?.userName,
          email: data.data?.email,
        }
      }

      throw new Error('Failed to fetch user info')
    } catch (error) {
      throw new Error(`User info fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
