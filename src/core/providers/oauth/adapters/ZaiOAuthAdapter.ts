import type { OAuthAdapter, OAuthConfig, OAuthTokenResponse } from '../types'
import { ProviderVendor } from '../../../../shared/types'

export class ZaiOAuthAdapter implements OAuthAdapter {
  providerType: ProviderVendor = 'zai'

  getAuthUrl(config: OAuthConfig): string {
    return `https://z.ai/login`
  }

  async extractTokens(url: string): Promise<OAuthTokenResponse> {
    try {
      const urlObj = new URL(url)
      const token = urlObj.searchParams.get('token')

      if (token) {
        return {
          access_token: token,
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

  async getUserInfo(accessToken: string): Promise<any> {
    try {
      const response = await fetch('https://z.ai/api/v1/user/info', {
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
