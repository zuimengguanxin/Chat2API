import type { OAuthAdapter, OAuthConfig, OAuthTokenResponse } from '../types'
import { ProviderVendor } from '../../../../shared/types'

export class QwenOAuthAdapter implements OAuthAdapter {
  providerType: ProviderVendor = 'qwen'

  getAuthUrl(config: OAuthConfig): string {
    return `https://tongyi.aliyun.com/login`
  }

  async extractTokens(url: string): Promise<OAuthTokenResponse> {
    try {
      const urlObj = new URL(url)
      const ticket = urlObj.searchParams.get('tongyi_sso_ticket')

      if (ticket) {
        return {
          tongyi_sso_ticket: ticket,
          token_type: 'cookie',
        }
      }

      return {
        error: 'No ticket found in callback',
        error_description: 'Could not extract SSO ticket from callback URL',
      }
    } catch (error) {
      return {
        error: 'Invalid callback URL',
        error_description: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async getUserInfo(ticket: string): Promise<any> {
    try {
      const response = await fetch('https://chat2-api.qianwen.com/api/v2/session/page/list', {
        method: 'POST',
        headers: {
          Cookie: `tongyi_sso_ticket=${ticket}`,
          'Content-Type': 'application/json',
          'Accept': '*/*',
          'Origin': 'https://www.qianwen.com',
          'Referer': 'https://www.qianwen.com/',
          'X-Platform': 'pc_tongyi',
        },
        body: JSON.stringify({}),
      })

      const data = await response.json()

      if (data?.success) {
        return {
          id: data?.data?.userId,
          name: data?.data?.userName,
        }
      }

      throw new Error('Failed to fetch user info')
    } catch (error) {
      throw new Error(`User info fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
