import type { OAuthAdapter, OAuthConfig, OAuthTokenResponse } from '../types'
import { ProviderVendor } from '../../../../shared/types'

export class MiniMaxOAuthAdapter implements OAuthAdapter {
  providerType: ProviderVendor = 'minimax'

  getAuthUrl(config: OAuthConfig): string {
    return `https://agent.minimaxi.com/login`
  }

  async extractTokens(url: string): Promise<OAuthTokenResponse> {
    try {
      const urlObj = new URL(url)
      const token = urlObj.searchParams.get('token')
      const realUserID = urlObj.searchParams.get('real_user_id')

      if (token) {
        return {
          access_token: token,
          real_user_id: realUserID,
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
      // MiniMax uses the token in headers to fetch user info
      const response = await fetch('https://agent.minimaxi.com/v1/api/user/info', {
        headers: {
          token: accessToken,
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (data?.data?.userInfo) {
        return {
          id: data.data.userInfo?.userId || data.data.realUserID,
          name: data.data.userInfo?.name || data.data.userInfo?.nickname,
          email: data.data.userInfo?.email,
        }
      }

      throw new Error('Failed to fetch user info')
    } catch (error) {
      throw new Error(`User info fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
