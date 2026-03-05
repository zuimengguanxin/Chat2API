import Router from '@koa/router'
import { Context, Next } from 'koa'
import { getOAuthManager } from '../../core/providers/oauth'

export function createOAuthRouter() {
  const router = new Router()

  /**
   * Start OAuth flow
   * GET /api/oauth/start?providerId=xxx&providerType=xxx
   */
  router.get('/start', async (ctx: Context) => {
    const { providerId, providerType } = ctx.query as Record<string, string>

    if (!providerId || !providerType) {
      ctx.status = 400
      ctx.body = { error: 'Missing providerId or providerType' }
      return
    }

    const oauth = getOAuthManager()
    const result = oauth.startOAuthFlow(providerId, providerType)

    if (!result) {
      ctx.status = 400
      ctx.body = { error: 'Failed to start OAuth flow' }
      return
    }

    ctx.body = result
  })

  /**
   * OAuth callback
   * GET /api/oauth/callback?state=xxx&code=xxx
   */
  router.get('/callback', async (ctx: Context) => {
    const { state } = ctx.query as Record<string, string>

    if (!state) {
      ctx.status = 400
      ctx.body = { error: 'Missing state parameter' }
      return
    }

    const oauth = getOAuthManager()
    const result = await oauth.handleCallback(state, ctx.href)

    if (!result.success) {
      ctx.status = 400
      ctx.body = { error: result.error }
      return
    }

    // Redirect to frontend with result
    ctx.redirect(`${ctx.origin}/#/oauth/result?success=true&providerId=${result.providerId}`)
  })

  /**
   * Extract credentials from browser data
   * POST /api/oauth/extract
   */
  router.post('/extract', async (ctx: Context) => {
    const { providerType, data } = ctx.request.body as {
      providerType: string
      data: Record<string, string>
    }

    if (!providerType || !data) {
      ctx.status = 400
      ctx.body = { error: 'Missing providerType or data' }
      return
    }

    const oauth = getOAuthManager()
    const result = await oauth.extractCredentialsFromBrowserData(providerType, data)

    ctx.body = result
  })

  /**
   * Get OAuth session status
   * GET /api/oauth/session/:state
   */
  router.get('/session/:state', async (ctx: Context) => {
    const { state } = ctx.params

    const oauth = getOAuthManager()
    const session = oauth.getSession(state)

    if (!session) {
      ctx.status = 404
      ctx.body = { error: 'Session not found' }
      return
    }

    const isExpired = Date.now() > session.expiresAt

    ctx.body = {
      providerId: session.providerId,
      providerType: session.providerType,
      isExpired,
      expiresIn: isExpired ? 0 : session.expiresAt - Date.now(),
    }
  })

  /**
   * Cancel OAuth session
   * DELETE /api/oauth/session/:state
   */
  router.delete('/session/:state', async (ctx: Context) => {
    const { state } = ctx.params

    const oauth = getOAuthManager()
    const deleted = oauth.removeSession(state)

    ctx.body = { success: deleted }
  })

  return router
}
