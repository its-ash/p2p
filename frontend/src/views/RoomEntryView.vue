<template>
  <div v-if="loading" class="min-h-dvh bg-[#0A0A0A] text-[#FAFAFA] flex items-center justify-center px-4">
    <div class="text-center">
      <div class="w-12 h-12 border-2 border-[#262626] border-t-[#FF3D00] animate-spin mx-auto mb-4" />
      <p class="type-label text-[#737373]">Loading room</p>
    </div>
  </div>

  <div v-else-if="error" class="min-h-dvh bg-[#0A0A0A] text-[#FAFAFA] flex items-center justify-center px-4">
    <div class="max-w-md w-full border border-[#FF3D00] bg-[#1A1A1A] px-5 py-4 text-sm">
      {{ error }}
    </div>
  </div>

  <VideoCallView v-else-if="mode === 'video'" />
  <FileShareView v-else-if="mode === 'files' && isHost" />
  <FileExplorerView v-else />
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import VideoCallView from './VideoCallView.vue'
import FileShareView from './FileShareView.vue'
import FileExplorerView from './FileExplorerView.vue'

const route = useRoute()
const roomId = String(route.params.roomId || '')
const loading = ref(true)
const error = ref<string | null>(null)
const mode = ref<'video' | 'files'>('video')

function resolveWorkerHttpBaseUrl(): string {
  const raw = String(import.meta.env.VITE_WORKER_URL ?? '').trim().replace(/\/$/, '')
  if (!raw) return 'http://127.0.0.1:8787'
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  if (raw.startsWith('ws://')) return `http://${raw.slice('ws://'.length)}`
  if (raw.startsWith('wss://')) return `https://${raw.slice('wss://'.length)}`
  return `https://${raw}`
}

const isHost = computed(() => {
  const key = `p2p-role:${roomId}`
  return sessionStorage.getItem(key) === 'host' || localStorage.getItem(key) === 'host'
})

onMounted(async () => {
  const workerBase = resolveWorkerHttpBaseUrl()
  try {
    const res = await fetch(`${workerBase}/room/${encodeURIComponent(roomId)}/info`)
    if (!res.ok) throw new Error(`Failed to load room info (${res.status})`)
    const json = await res.json()
    const kind = String(json?.kind ?? '').toLowerCase()
    mode.value = kind === 'files' ? 'files' : 'video'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to resolve room mode'
  } finally {
    loading.value = false
  }
})
</script>
