import { ref, onUnmounted } from 'vue'

export type SignalMsg =
  | { type: 'peer_joined'; peer_id: string }
  | { type: 'peer_left'; peer_id: string }
  | { type: 'pong'; peers: string[] }
  | { type: 'offer'; sdp: string; from: string; to: string }
  | { type: 'answer'; sdp: string; from: string; to: string }
  | { type: 'ice_candidate'; candidate: string; sdp_mid: string | null; sdp_mline_index: number | null; from: string; to: string }
  | { type: 'room_full' }
  | { type: 'error'; message: string }

function resolveWorkerBaseUrl(): string {
  const raw = String(import.meta.env.VITE_WORKER_URL ?? '').trim().replace(/\/$/, '')

  if (!raw) {
    return 'ws://127.0.0.1:8787'
  }

  if (raw.startsWith('ws://') || raw.startsWith('wss://')) {
    return raw
  }

  if (raw.startsWith('http://')) {
    return `ws://${raw.slice('http://'.length)}`
  }

  if (raw.startsWith('https://')) {
    return `wss://${raw.slice('https://'.length)}`
  }

  return `wss://${raw}`
}

const WORKER_URL = resolveWorkerBaseUrl()

export function useSignaling(roomId: string, peerId: string) {
  const ws = ref<WebSocket | null>(null)
  const connected = ref(false)
  const error = ref<string | null>(null)
  const remotePeerId = ref<string | null>(null)
  const handlers = new Map<string, (msg: SignalMsg) => void>()
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let reconnectAttempt = 0
  let disconnectedByUser = false

  function on(type: string, handler: (msg: SignalMsg) => void) {
    handlers.set(type, handler)
  }

  function connect() {
    disconnectedByUser = false
    const url = `${WORKER_URL}/room/${roomId}/ws?peer_id=${peerId}`
    let socket: WebSocket
    try {
      socket = new WebSocket(url)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to open signaling websocket'
      error.value = `${message}. URL=${url}`
      connected.value = false
      return
    }

    ws.value = socket
    error.value = null

    socket.onopen = () => {
      connected.value = true
      error.value = null
      reconnectAttempt = 0
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      heartbeatTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping', peer_id: peerId }))
        }
      }, 3000)
      socket.send(JSON.stringify({ type: 'ping', peer_id: peerId }))
    }

    socket.onmessage = (e) => {
      try {
        const msg: SignalMsg = JSON.parse(e.data)
        if (msg.type === 'peer_joined') remotePeerId.value = msg.peer_id
        if (msg.type === 'peer_left') remotePeerId.value = null
        if (msg.type === 'pong') {
          remotePeerId.value = (msg.peers ?? []).find((id) => id !== peerId) ?? null
        }

        if (msg.type === 'room_full') {
          connected.value = false
          const delay = Math.min(3000, 500 * Math.pow(2, reconnectAttempt))
          reconnectAttempt += 1
          error.value = `Room is reconnecting... retrying in ${Math.round(delay / 1000)}s`
          try { socket.close() } catch { /* ignore */ }
          if (!disconnectedByUser) {
            if (reconnectTimer) clearTimeout(reconnectTimer)
            reconnectTimer = setTimeout(() => connect(), delay)
          }
        }

        const h = handlers.get(msg.type)
        if (h) h(msg)
      } catch { /* ignore malformed */ }
    }

    socket.onclose = () => {
      connected.value = false
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = null
      }
      if (!disconnectedByUser && !reconnectTimer) {
        const delay = Math.min(3000, 500 * Math.pow(2, reconnectAttempt))
        reconnectAttempt += 1
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          connect()
        }, delay)
      }
    }
    socket.onerror = () => {
      connected.value = false
      error.value = `Unable to reach signaling server. URL=${url}`
    }
  }

  function send(msg: object) {
    if (ws.value?.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify(msg))
    }
  }

  function disconnect() {
    disconnectedByUser = true
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    ws.value?.close()
    ws.value = null
    connected.value = false
  }

  onUnmounted(disconnect)

  return { connect, send, disconnect, connected, remotePeerId, error, on }
}
