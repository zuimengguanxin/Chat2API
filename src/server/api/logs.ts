import Router from '@koa/router'
import { LogManager } from '../storage/logs'

export function createLogsRouter() {
  const router = new Router()

  router.get('/', async (ctx) => {
    const { level, limit = 100, offset = 0 } = ctx.query
    ctx.body = LogManager.get(
      Number(limit), 
      level === 'all' ? undefined : level as any,
      Number(offset)
    )
  })

  router.get('/stats', async (ctx) => {
    ctx.body = LogManager.getStats()
  })

  router.get('/trend', async (ctx) => {
    const { days = 7 } = ctx.query
    ctx.body = LogManager.getTrend(Number(days))
  })

  router.get('/account/:accountId/trend', async (ctx) => {
    const { days = 7 } = ctx.query
    ctx.body = LogManager.getAccountTrend(ctx.params.accountId, Number(days))
  })

  router.get('/:id', async (ctx) => {
    const log = LogManager.getById(ctx.params.id)
    if (!log) {
      ctx.status = 404
      ctx.body = { error: 'Log not found' }
      return
    }
    ctx.body = log
  })

  router.delete('/', async (ctx) => {
    LogManager.clear()
    ctx.body = { success: true }
  })

  router.get('/export', async (ctx) => {
    const { format = 'json' } = ctx.query
    ctx.body = { data: LogManager.export(format as any) }
  })

  return router
}
