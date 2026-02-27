type MessageHandler = (data: unknown) => void

class WebSocketClient {
  private ws: WebSocket | null = null
  private handlers: Map<string, MessageHandler[]> = new Map()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  connect() {
    if (this.ws) return
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws`
    
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      console.log('WebSocket connected')
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
      }
    }

    this.ws.onmessage = (event) => {
      try {
        const { type, data } = JSON.parse(event.data)
        const handlers = this.handlers.get(type) || []
        handlers.forEach(h => h(data))
      } catch (e) {
        console.error('WebSocket parse error:', e)
      }
    }

    this.ws.onclose = () => {
      this.ws = null
      this.reconnectTimer = setTimeout(() => this.connect(), 3000)
    }
  }

  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, [])
    }
    this.handlers.get(type)!.push(handler)
    return () => {
      const handlers = this.handlers.get(type) || []
      const index = handlers.indexOf(handler)
      if (index > -1) handlers.splice(index, 1)
    }
  }
}

export const wsClient = new WebSocketClient()
