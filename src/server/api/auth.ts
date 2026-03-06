import Router from '@koa/router'
import { isPasswordSet, setPassword, verifyPassword, createSession, destroySession } from '../middleware/auth'

const AUTH_COOKIE_NAME = 'chat2api_auth'

export function createAuthRouter() {
  const router = new Router()

  router.get('/status', async (ctx) => {
    ctx.body = { 
      hasPassword: isPasswordSet(),
      needSetup: !isPasswordSet()
    }
  })

  router.post('/setup', async (ctx) => {
    if (isPasswordSet()) {
      ctx.status = 400
      ctx.body = { error: 'Password already set' }
      return
    }

    const { password } = ctx.request.body as any
    if (!password || password.length < 4) {
      ctx.status = 400
      ctx.body = { error: 'Password must be at least 4 characters' }
      return
    }

    setPassword(password)
    const token = createSession()
    ctx.cookies.set(AUTH_COOKIE_NAME, token, { 
      httpOnly: true, 
      maxAge: 7 * 24 * 60 * 60 * 1000,
      domain: 'localhost',
      path: '/'
    })
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
      domain: 'localhost',
      path: '/'
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
