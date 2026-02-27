import { WebSocket } from 'ws'

const clients = new Set<WebSocket>()

export function addClient(ws: WebSocket): void {
  clients.add(ws)
}

export function removeClient(ws: WebSocket): void {
  clients.delete(ws)
}

export function broadcast(type: string, data: unknown): void {
  const message = JSON.stringify({ type, data })
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  })
}

export function broadcastLog(log: any): void {
  broadcast('log:new', log)
}

export function broadcastProxyStatus(status: any): void {
  broadcast('proxy:status', status)
}
