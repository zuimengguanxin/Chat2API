import type { OAuthAdapter, OAuthConfig, OAuthTokenResponse } from '../types'
import { ProviderVendor } from '../../../../shared/types'

export class DeepSeekOAuthAdapter implements OAuthAdapter {
  providerType: ProviderVendor = 'deepseek'

  getAuthUrl(config: OAuthConfig): string {
    // DeepSeek uses browser-based OAuth flow
    // The user needs to login and extract token from localStorage
    return `https://chat.deepseek.com`
  }

  async extractTokens(url: string): Promise<OAuthTokenResponse> {
    // DeepSeek OAuth uses a special flow where tokens are extracted from browser
    // This is handled by the OAuthManager through a proxy endpoint
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
      const response = await fetch('https://chat.deepseek.com/api/v0/users/current', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (data?.code === 0 && data?.data?.biz_data) {
        const bizData = data.data.biz_data
        return {
          id: bizData.id,
          name: bizData.id_profile?.name,
          email: bizData.email,
        }
      }

      throw new Error(data?.msg || 'Failed to fetch user info')
    } catch (error) {
      throw new Error(`User info fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
