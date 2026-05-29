import { ref, onUnmounted } from 'vue'
import { useSignaling } from './useSignaling'

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  children?: FileNode[]
  loaded?: boolean
}

const CHUNK_SIZE = 64 * 1024 // 64 KB

function joinPath(parentPath: string, name: string): string {
  return parentPath === '/' ? `/${name}` : `${parentPath}/${name}`
}

export function useFileShare(roomId: string, peerId: string, isHost: boolean) {
  const sig = useSignaling(roomId, peerId)
  const tree = ref<FileNode | null>(null)
  const dataConnected = ref(false)
  const transferProgress = ref<Record<string, number>>({})
  const receivedFiles = ref<Record<string, { blob: Blob; url: string }>>({})

  let pc: RTCPeerConnection | null = null
  let dataChannel: RTCDataChannel | null = null
  let isOffering = false
  const pendingFiles = new Map<string, { total: number; chunks: ArrayBuffer[]; received: number }>()
  const rootHandle = ref<FileSystemDirectoryHandle | FileSystemFileHandle | null>(null)

  const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]

  async function makeShallowNode(entry: FileSystemHandle, parentPath: string): Promise<FileNode> {
    const nextPath = joinPath(parentPath, entry.name)
    if (entry.kind === 'file') {
      const file = await (entry as FileSystemFileHandle).getFile()
      return { name: entry.name, path: nextPath, type: 'file', size: file.size }
    }
    return { name: entry.name, path: nextPath, type: 'directory', children: [], loaded: false }
  }

  async function listDirectoryChildren(dir: FileSystemDirectoryHandle, parentPath: string): Promise<FileNode[]> {
    const children: FileNode[] = []
    for await (const entry of (dir as any).values()) {
      children.push(await makeShallowNode(entry as FileSystemHandle, parentPath))
    }
    return children
  }

  async function buildTree(handle: FileSystemDirectoryHandle | FileSystemFileHandle, path = ''): Promise<FileNode> {
    if (handle.kind === 'file') {
      const fh = handle as FileSystemFileHandle
      const file = await fh.getFile()
      return { name: handle.name, path: path || '/', type: 'file', size: file.size }
    }

    const dirPath = path || '/'
    const children = await listDirectoryChildren(handle as FileSystemDirectoryHandle, dirPath)
    return { name: handle.name, path: dirPath, type: 'directory', children, loaded: true }
  }

  async function resolveHandle(path: string): Promise<FileSystemDirectoryHandle | FileSystemFileHandle | null> {
    if (!rootHandle.value) return null
    const parts = path.replace(/^\//, '').split('/').filter(Boolean)
    if (!parts.length) return rootHandle.value

    let current: FileSystemDirectoryHandle | FileSystemFileHandle = rootHandle.value
    for (let i = 0; i < parts.length; i++) {
      if (current.kind !== 'directory') return null
      const directory = current as FileSystemDirectoryHandle
      current = await directory.getDirectoryHandle(parts[i]).catch(() => directory.getFileHandle(parts[i]))
    }
    return current
  }

  async function resolveFile(node: FileNode): Promise<File | null> {
    const current = await resolveHandle(node.path)
    if (!current) return null
    if (current.kind === 'file') return (current as FileSystemFileHandle).getFile()
    return null
  }

  async function resolveDirectory(path: string): Promise<FileSystemDirectoryHandle | null> {
    const current = await resolveHandle(path)
    if (!current || current.kind !== 'directory') return null
    return current as FileSystemDirectoryHandle
  }

  function findNodeByPath(root: FileNode | null, path: string): FileNode | null {
    if (!root) return null
    if (root.path === path) return root
    if (root.type !== 'directory' || !root.children?.length) return null
    for (const child of root.children) {
      const found = findNodeByPath(child, path)
      if (found) return found
    }
    return null
  }

  function sendTree(ch: RTCDataChannel) {
    if (!isHost || !tree.value || ch.readyState !== 'open') return
    ch.send(JSON.stringify({ type: 'tree', data: tree.value }))
  }

  function setupDataChannel(ch: RTCDataChannel) {
    dataChannel = ch
    ch.binaryType = 'arraybuffer'
    ch.onopen = () => {
      dataConnected.value = true
      if (isHost) {
        sendTree(ch)
      } else {
        ch.send(JSON.stringify({ type: 'tree_request' }))
      }
    }
    ch.onclose = () => {
      dataConnected.value = false
    }

    ch.onmessage = async (e) => {
      if (typeof e.data === 'string') {
        const msg = JSON.parse(e.data)

        if (msg.type === 'tree') {
          tree.value = msg.data
        }

        if (msg.type === 'dir_data') {
          const node = findNodeByPath(tree.value, msg.path)
          if (node && node.type === 'directory') {
            node.children = msg.children
            node.loaded = true
            tree.value = { ...tree.value! }
          }
        }

        if (msg.type === 'tree_request' && isHost) {
          sendTree(ch)
        }

        if (msg.type === 'dir_request' && isHost) {
          const path = String(msg.path || '')
          if (!path) return
          const dir = await resolveDirectory(path)
          if (!dir) return
          const children = await listDirectoryChildren(dir, path)
          ch.send(JSON.stringify({ type: 'dir_data', path, children }))
        }

        if (msg.type === 'file_request' && isHost) {
          const node = msg.node as FileNode
          const file = await resolveFile(node)
          if (!file) return
          const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
          ch.send(JSON.stringify({ type: 'file_start', path: node.path, total: totalChunks, size: file.size, name: file.name }))
          for (let i = 0; i < totalChunks; i++) {
            const chunk = await file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).arrayBuffer()
            ch.send(chunk)
          }
          ch.send(JSON.stringify({ type: 'file_end', path: node.path }))
        }

        if (msg.type === 'file_start') {
          pendingFiles.set(msg.path, { total: msg.total, chunks: [], received: 0 })
          transferProgress.value[msg.path] = 0
        }

        if (msg.type === 'file_end') {
          const pending = pendingFiles.get(msg.path)
          if (pending) {
            const blob = new Blob(pending.chunks)
            const url = URL.createObjectURL(blob)
            receivedFiles.value[msg.path] = { blob, url }
            pendingFiles.delete(msg.path)
            transferProgress.value[msg.path] = 100
          }
        }
      } else {
        // Binary chunk — associate with the last started file
        for (const [path, pending] of pendingFiles) {
          pending.chunks.push(e.data as ArrayBuffer)
          pending.received++
          transferProgress.value[path] = Math.round((pending.received / pending.total) * 100)
          break
        }
      }
    }
  }

  function createHostPeerConnection() {
    pc?.close()
    pc = new RTCPeerConnection({ iceServers: ICE })

    const ch = pc.createDataChannel('files', { ordered: true })
    setupDataChannel(ch)

    pc.onicecandidate = (e) => {
      if (e.candidate && sig.remotePeerId.value) {
        sig.send({
          type: 'ice_candidate',
          candidate: e.candidate.candidate,
          sdp_mid: e.candidate.sdpMid ?? null,
          sdp_mline_index: e.candidate.sdpMLineIndex ?? null,
          from: peerId,
          to: sig.remotePeerId.value,
        })
      }
    }

    pc.onconnectionstatechange = () => {
      if (!pc) return
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        dataConnected.value = false
      }
    }
  }

  async function hostOfferIfNeeded(forceNewPc = false) {
    if (!sig.remotePeerId.value) return
    if (isOffering) return

    if (
      forceNewPc ||
      !pc ||
      !dataChannel ||
      dataChannel.readyState === 'closed' ||
      pc.connectionState === 'failed' ||
      pc.connectionState === 'closed'
    ) {
      createHostPeerConnection()
    }

    if (!pc || !sig.remotePeerId.value) return
    if (pc.signalingState !== 'stable') return

    isOffering = true
    try {
      const offer = await pc.createOffer({
        iceRestart: pc.connectionState === 'disconnected' || pc.connectionState === 'failed',
      })
      await pc.setLocalDescription(offer)
      sig.send({ type: 'offer', sdp: offer.sdp, from: peerId, to: sig.remotePeerId.value })
    } finally {
      isOffering = false
    }
  }

  async function hostShare(handle: FileSystemDirectoryHandle | FileSystemFileHandle) {
    rootHandle.value = handle
    tree.value = await buildTree(handle)

    createHostPeerConnection()

    sig.on('peer_joined', async () => {
      await hostOfferIfNeeded()
    })

    sig.on('peer_left', async () => {
      dataConnected.value = false
      await hostOfferIfNeeded(true)
    })

    sig.on('pong', async () => {
      if (!dataConnected.value && sig.remotePeerId.value) {
        await hostOfferIfNeeded()
      }
    })

    sig.on('answer', async (msg: any) => {
      if (!pc) return
      await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp })
      if (dataChannel) {
        sendTree(dataChannel)
      }
    })

    sig.on('ice_candidate', async (msg: any) => {
      await pc!.addIceCandidate({ candidate: msg.candidate, sdpMid: msg.sdp_mid, sdpMLineIndex: msg.sdp_mline_index }).catch(() => {})
    })

    sig.connect()
  }

  async function guestJoin() {
    pc = new RTCPeerConnection({ iceServers: ICE })

    pc.ondatachannel = (e) => setupDataChannel(e.channel)

    pc.onicecandidate = (e) => {
      if (e.candidate && sig.remotePeerId.value) {
        sig.send({ type: 'ice_candidate', candidate: e.candidate.candidate, sdp_mid: e.candidate.sdpMid ?? null, sdp_mline_index: e.candidate.sdpMLineIndex ?? null, from: peerId, to: sig.remotePeerId.value })
      }
    }

    sig.on('offer', async (msg: any) => {
      await pc!.setRemoteDescription({ type: 'offer', sdp: msg.sdp })
      const answer = await pc!.createAnswer()
      await pc!.setLocalDescription(answer)
      sig.send({ type: 'answer', sdp: answer.sdp, from: peerId, to: msg.from })
    })

    sig.on('ice_candidate', async (msg: any) => {
      await pc!.addIceCandidate({ candidate: msg.candidate, sdpMid: msg.sdp_mid, sdpMLineIndex: msg.sdp_mline_index }).catch(() => {})
    })

    sig.connect()
  }

  function requestFile(node: FileNode) {
    if (dataChannel?.readyState === 'open') {
      dataChannel.send(JSON.stringify({ type: 'file_request', node }))
    }
  }

  function requestDirectory(path: string) {
    if (dataChannel?.readyState === 'open') {
      dataChannel.send(JSON.stringify({ type: 'dir_request', path }))
    }
  }

  function cleanup() {
    pc?.close()
    sig.disconnect()
    dataConnected.value = false
    for (const { url } of Object.values(receivedFiles.value)) URL.revokeObjectURL(url)
  }

  onUnmounted(cleanup)

  return {
    tree,
    transferProgress,
    receivedFiles,
    hostShare,
    guestJoin,
    requestFile,
    requestDirectory,
    connected: sig.connected,
    dataConnected,
    signalingError: sig.error,
  }
}
