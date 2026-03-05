import Router from '@koa/router'
import { createProvidersRouter } from './providers'
import { createAccountsRouter } from './accounts'
import { createProxyRouter } from './proxy'
import { createLogsRouter } from './logs'
import { createConfigRouter } from './config'
import { createApiKeysRouter } from './apikeys'
import { createOAuthRouter } from './oauth'

export function registerRoutes(router: Router) {
  router.use('/api/providers', createProvidersRouter().routes())
  router.use('/api/accounts', createAccountsRouter().routes())
  router.use('/api/proxy', createProxyRouter().routes())
  router.use('/api/logs', createLogsRouter().routes())
  router.use('/api/config', createConfigRouter().routes())
  router.use('/api/api-keys', createApiKeysRouter().routes())
  router.use('/api/oauth', createOAuthRouter().routes())
}
