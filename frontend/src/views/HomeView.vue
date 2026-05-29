<template>
  <div class="min-h-dvh bg-[#0A0A0A] text-[#FAFAFA] relative overflow-hidden">
    <div aria-hidden="true" class="pointer-events-none absolute -left-10 top-20 text-[6rem] md:text-[10rem] leading-none font-black tracking-[-0.06em] text-[#1A1A1A] select-none">P2P</div>
    <div class="relative z-10 max-w-5xl mx-auto px-6 md:px-12 py-16 md:py-24">
      <p class="type-label text-[#737373] mb-6">Direct Peer Connection</p>
      <h1 class="text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-[-0.06em] leading-[1] max-w-4xl">
        Talk.
        <span class="text-[#FF3D00]">Share.</span>
        Stay P2P.
      </h1>
      <p class="mt-8 text-base md:text-lg leading-relaxed text-[#737373] max-w-2xl">
        Video calls and file transfer with one room link. The app resolves the connection type automatically.
      </p>

      <div class="mt-14 grid grid-cols-1 md:grid-cols-2 border border-[#262626]">
        <button
          @click="go('video')"
          class="group text-left p-8 md:p-10 border-b md:border-b-0 md:border-r border-[#262626] hover:bg-[#111111] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3D00] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0A]"
        >
          <p class="type-label text-[#737373]">Mode 01</p>
          <h2 class="mt-4 text-3xl md:text-4xl tracking-[-0.04em] font-bold">Video Call</h2>
          <p class="mt-4 text-[#737373] leading-relaxed">Audio-priority conferencing with camera and screen sharing.</p>
          <span class="mt-8 inline-flex items-center gap-2 text-[#FF3D00] uppercase tracking-[0.1em] text-xs font-semibold">
            Start
            <span class="h-[2px] w-12 bg-[#FF3D00] transition-all duration-150 group-hover:w-16" />
          </span>
        </button>

        <button
          @click="go('files')"
          class="group text-left p-8 md:p-10 hover:bg-[#111111] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3D00] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0A]"
        >
          <p class="type-label text-[#737373]">Mode 02</p>
          <h2 class="mt-4 text-3xl md:text-4xl tracking-[-0.04em] font-bold">File Share</h2>
          <p class="mt-4 text-[#737373] leading-relaxed">Share files or folders and let the receiver browse in a live explorer.</p>
          <span class="mt-8 inline-flex items-center gap-2 text-[#FF3D00] uppercase tracking-[0.1em] text-xs font-semibold">
            Host
            <span class="h-[2px] w-12 bg-[#FF3D00] transition-all duration-150 group-hover:w-16" />
          </span>
        </button>
      </div>

      <div class="mt-10 border border-[#262626] bg-[#0F0F0F] p-6 md:p-8">
        <p class="type-label text-[#737373] mb-4">Join Existing Room</p>
        <div class="flex flex-col sm:flex-row gap-4">
          <input
            v-model="joinRoom"
            type="text"
            placeholder="Paste room ID or URL"
            class="flex-1 h-12 bg-[#1A1A1A] border border-[#262626] px-4 text-base text-[#FAFAFA] placeholder:text-[#737373] outline-none focus:border-[#FF3D00]"
            @keyup.enter="joinSession"
          />
          <button
            @click="joinSession"
            class="h-12 px-6 border border-[#FAFAFA] text-[#FAFAFA] uppercase tracking-[0.1em] text-xs font-semibold hover:bg-[#FAFAFA] hover:text-[#0A0A0A] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3D00] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0A]"
          >
            Join
          </button>
        </div>
        <p v-if="launchError" class="mt-4 text-xs text-[#FF3D00] border border-[#FF3D00] bg-[#1A1A1A] px-3 py-2">
          {{ launchError }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const joinRoom = ref('')
const launchError = ref<string | null>(null)

function resolveWorkerHttpBaseUrl(): string {
  const raw = String(import.meta.env.VITE_WORKER_URL ?? '').trim().replace(/\/$/, '')

  if (!raw) {
    return 'http://127.0.0.1:8787'
  }

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw
  }

  if (raw.startsWith('ws://')) {
    return `http://${raw.slice('ws://'.length)}`
  }

  if (raw.startsWith('wss://')) {
    return `https://${raw.slice('wss://'.length)}`
  }

  return `https://${raw}`
}

async function createRoom(kind: 'video' | 'files'): Promise<string> {
  const workerBase = resolveWorkerHttpBaseUrl()
  const res = await fetch(`${workerBase}/room/new?kind=${kind}`)
  if (!res.ok) {
    throw new Error(`Unable to create room (${res.status})`)
  }
  const payload = await res.json()
  return String(payload?.room ?? '')
}

async function go(mode: 'video' | 'files') {
  launchError.value = null
  let roomId = ''
  try {
    roomId = await createRoom(mode)
  } catch {
    roomId = mode === 'video'
      ? `V${Math.random().toString(36).slice(2, 6).toUpperCase()}`
      : `S${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`
    launchError.value = 'Server room creation failed. Using local fallback room ID.'
  }
  if (!roomId) return
  if (mode === 'files') {
    const key = `p2p-role:${roomId}`
    sessionStorage.setItem(key, 'host')
    localStorage.setItem(key, 'host')
  }
  router.push({ name: 'room-entry', params: { roomId } })
}

function joinSession() {
  const raw = joinRoom.value.trim()
  if (!raw) return

  const tryAsUrl = (() => {
    try { return new URL(raw) } catch { return null }
  })()

  if (tryAsUrl) {
    const parts = tryAsUrl.pathname.split('/').filter(Boolean)
    const mode = parts[0]
    const roomId = parts.at(-1)
    if (!roomId) return
    if (mode === 'room') {
      router.push({ name: 'room-entry', params: { roomId } })
      return
    }
    if (mode === 'call') {
      router.push({ name: 'video-call', params: { roomId } })
      return
    }
    if (mode === 'files') {
      router.push({ name: 'file-explorer', params: { roomId } })
      return
    }
  }

  router.push({ name: 'room-entry', params: { roomId: raw.toUpperCase() } })
}
</script>
