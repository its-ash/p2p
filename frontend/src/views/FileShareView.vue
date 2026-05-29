<template>
  <div class="min-h-dvh bg-[#0A0A0A] text-[#FAFAFA] flex flex-col items-center justify-center px-4 py-16 relative overflow-hidden">
    <div aria-hidden="true" class="pointer-events-none absolute left-4 top-10 text-[4rem] md:text-[7rem] font-black tracking-[-0.06em] text-[#1A1A1A] leading-none">FILES</div>

    <button
      @click="$router.push({ name: 'home' })"
      class="absolute top-5 left-5 h-9 px-3 border border-[#FAFAFA] text-[#FAFAFA] text-xs uppercase tracking-[0.1em] font-semibold hover:bg-[#FAFAFA] hover:text-[#0A0A0A] transition-colors duration-150"
      aria-label="Home"
    >
      Home
    </button>

    <!-- Step 1: Pick file or folder -->
    <div v-if="!shareUrl" class="relative z-10 w-full max-w-lg text-center">
      <div class="w-16 h-16 border border-[#262626] bg-[#111111] flex items-center justify-center mx-auto mb-6">
        <svg class="w-8 h-8 text-[#FF3D00]" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
        </svg>
      </div>
      <h1 class="text-5xl md:text-6xl font-extrabold tracking-[-0.06em] mb-3">Share Files</h1>
      <p class="text-[#737373] mb-10 leading-relaxed max-w-xl mx-auto">Select a file or folder. A share link is generated and the receiver can browse like a file explorer.</p>

      <div class="grid grid-cols-2 gap-4">
        <button
          @click="pickFile"
          class="group border border-[#262626] bg-[#0F0F0F] p-6 hover:bg-[#111111] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3D00] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0A]"
        >
          <div class="w-12 h-12 border border-[#262626] bg-[#1A1A1A] flex items-center justify-center mx-auto mb-4">
            <svg class="w-6 h-6 text-[#FAFAFA]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <p class="text-sm font-semibold uppercase tracking-[0.1em]">Single File</p>
        </button>

        <button
          @click="pickFolder"
          class="group border border-[#262626] bg-[#0F0F0F] p-6 hover:bg-[#111111] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3D00] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0A]"
        >
          <div class="w-12 h-12 border border-[#262626] bg-[#1A1A1A] flex items-center justify-center mx-auto mb-4">
            <svg class="w-6 h-6 text-[#FAFAFA]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
          </div>
          <p class="text-sm font-semibold uppercase tracking-[0.1em]">Folder</p>
        </button>
      </div>

      <p v-if="!supported" class="mt-6 text-sm text-[#FF3D00] border border-[#FF3D00] bg-[#1A1A1A] px-4 py-3">
        Your browser doesn't support the File System Access API. Use Chrome or Edge.
      </p>
    </div>

    <!-- Step 2: Waiting for peer with share link -->
    <div v-else class="relative z-10 w-full max-w-lg text-center">
      <div class="w-16 h-16 border border-[#262626] bg-[#111111] flex items-center justify-center mx-auto mb-6 animate-pulse">
        <svg class="w-8 h-8 text-[#FF3D00]" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
        </svg>
      </div>
      <h1 class="text-4xl tracking-[-0.04em] font-bold mb-2">{{ connected ? 'Peer connected!' : 'Waiting for peer...' }}</h1>
      <p class="text-sm text-[#737373] mb-8">Share this link. The receiver can browse {{ selectedName }} directly.</p>

      <div class="bg-[#0F0F0F] border border-[#262626] p-6">
        <p class="type-label text-[#737373] mb-3">Share Link</p>
        <div class="flex gap-3">
          <input
            :value="shareUrl"
            readonly
            class="flex-1 bg-[#1A1A1A] border border-[#262626] px-4 h-12 text-sm text-[#FAFAFA] outline-none"
            @click="(e) => (e.target as HTMLInputElement).select()"
          />
          <button
            @click="copyShareUrl"
            class="h-12 px-5 border text-xs uppercase tracking-[0.1em] font-semibold transition-all duration-150"
            :class="copied ? 'border-[#FAFAFA] bg-[#FAFAFA] text-[#0A0A0A]' : 'border-[#FF3D00] text-[#FF3D00] hover:bg-[#FF3D00] hover:text-[#0A0A0A]'"
          >
            {{ copied ? '✓' : 'Copy' }}
          </button>
        </div>
      </div>

      <button @click="reset" class="mt-6 h-10 px-6 border border-[#FAFAFA] text-[#FAFAFA] text-xs uppercase tracking-[0.1em] font-semibold hover:bg-[#FAFAFA] hover:text-[#0A0A0A] transition-colors duration-150">
        Share something else
      </button>

      <p v-if="signalingError" class="mt-4 text-xs text-[#FF3D00] border border-[#FF3D00] bg-[#1A1A1A] px-4 py-3 break-all">
        {{ signalingError }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useFileShare } from '../composables/useFileShare'

const route = useRoute()
const router = useRouter()
const roomId = (route.params.roomId as string) || crypto.randomUUID()

function getStablePeerId(room: string): string {
  const key = `p2p-peer:${room}:files`
  const existing = sessionStorage.getItem(key)
  if (existing) return existing
  const next = crypto.randomUUID()
  sessionStorage.setItem(key, next)
  return next
}

const peerId = getStablePeerId(roomId)
const shareUrl = ref('')
const copied = ref(false)
const selectedName = ref('')
const supported = ref(true)

const { hostShare, connected, signalingError } = useFileShare(roomId, peerId, true)

onMounted(() => {
  if (!('showOpenFilePicker' in window)) supported.value = false
})

async function pickFile() {
  try {
    const [handle] = await (window as any).showOpenFilePicker({ multiple: false })
    selectedName.value = handle.name
    await startHosting(handle)
  } catch { /* user cancelled */ }
}

async function pickFolder() {
  try {
    const handle = await (window as any).showDirectoryPicker()
    selectedName.value = handle.name
    await startHosting(handle)
  } catch { /* user cancelled */ }
}

async function startHosting(handle: any) {
  const key = `p2p-role:${roomId}`
  sessionStorage.setItem(key, 'host')
  localStorage.setItem(key, 'host')
  if (!route.params.roomId) {
    router.replace({ name: 'file-share', params: { roomId } })
  }
  shareUrl.value = `${location.origin}/room/${roomId}`
  await hostShare(handle)
}

async function copyShareUrl() {
  await navigator.clipboard.writeText(shareUrl.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function reset() {
  shareUrl.value = ''
  selectedName.value = ''
}
</script>
