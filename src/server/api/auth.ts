import Router from '@koa/router'
import { isPasswordSet, setPassword, verifyPassword, createSession, destroySession, validateSessionToken } from '../middleware/auth'

const AUTH_COOKIE_NAME = 'chat2api_auth'

export function createAuthRouter() {
  const router = new Router()

  router.get('/status', async (ctx) => {
    const hasPassword = isPasswordSet()
    console.log('Auth status check - hasPassword:', hasPassword)
    ctx.body = {
      hasPassword: hasPassword,
      needSetup: !hasPassword
    }
  })

  router.get('/verify', async (ctx) => {
    console.log('=== GET /api/auth/verify called ===')
    const hasPassword = isPasswordSet()
    console.log('hasPassword:', hasPassword)

    const allCookies = ctx.cookies.get()
    console.log('All cookies received:', Object.keys(allCookies).length, 'cookies')

    if (!hasPassword) {
      console.log('Password not set, need setup')
      ctx.body = { authenticated: false, needSetup: true }
      return
    }

    const token = ctx.cookies.get(AUTH_COOKIE_NAME)
    console.log('Token from cookie:', token ? token.substring(0, 8) + '...' : 'missing')

    console.log('Validating token...')
    const isValidToken = validateSessionToken(token)
    console.log('Token validation result:', isValidToken)

    if (!token || !isValidToken) {
      console.log('Invalid or missing token')
      ctx.body = { authenticated: false }
      return
    }

    console.log('Authentication successful')
    ctx.body = { authenticated: true }
  })

  router.post('/setup', async (ctx) => {
    console.log('=== POST /api/auth/setup called ===')
    const beforeSetup = isPasswordSet()
    console.log('Before setup - isPasswordSet():', beforeSetup)

    if (isPasswordSet()) {
      console.log('Password already set')
      ctx.status = 400
      ctx.body = { error: 'Password already set' }
      return
    }

    const { password } = ctx.request.body as any
    console.log('Setting password with length:', password?.length)
    if (!password || password.length < 4) {
      ctx.status = 400
      ctx.body = { error: 'Password must be at least 4 characters' }
      return
    }

    setPassword(password)
    console.log('Password set successfully')

    const afterSetup = isPasswordSet()
    console.log('After setup - isPasswordSet():', afterSetup)

    const token = createSession()
    console.log('Session token created:', token.substring(0, 8) + '...')
    const cookiesBeforeString = JSON.stringify(ctx.cookies.get())
    console.log('Cookies before set:', cookiesBeforeString.substring(0, 200))

    ctx.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
      sameSite: 'lax',
      domain: '' // Empty domain for automatic detection
    })

    const cookiesAfterString = JSON.stringify(ctx.cookies.get())
    console.log('Cookies after set:', cookiesAfterString.substring(0, 200))
    console.log('=== Setup completed ===')
    ctx.body = { success: true }
  })

  router.post('/login', async (ctx) => {
    const { password } = ctx.request.body as any
    
    if (!verifyPassword(password)) {
      ctx.status = 401
      ctx.body = { error: 'Invalid password' }
      return
    }

    const token = createSession()
    ctx.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
      sameSite: 'lax',
      domain: '' // Empty domain for automatic detection
    })
    ctx.body = { success: true }
  })

  router.post('/logout', async (ctx) => {
    const token = ctx.cookies.get(AUTH_COOKIE_NAME)
    if (token) {
      destroySession(token)
      ctx.cookies.set(AUTH_COOKIE_NAME, '', { maxAge: 0 })
    }
    ctx.body = { success: true }
  })

  return router
}
