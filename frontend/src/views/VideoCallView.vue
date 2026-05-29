<template>
  <div class="h-dvh bg-[#0A0A0A] text-[#FAFAFA] flex flex-col relative overflow-hidden">
    <div aria-hidden="true" class="pointer-events-none absolute left-4 top-10 text-[4rem] md:text-[7rem] font-black tracking-[-0.06em] text-[#1A1A1A] leading-none">LIVE</div>

    <!-- Waiting / connecting state -->
    <div v-if="callState === 'idle' || callState === 'connecting'" class="relative z-10 flex flex-col items-center justify-center flex-1 gap-8 px-4">
      <div v-if="localStream" class="w-56 overflow-hidden bg-[#111111] border border-[#262626]">
        <video :srcObject="localStream" autoplay playsinline muted class="w-full h-36 object-cover -scale-x-100" />
      </div>

      <div class="text-center">
        <div class="w-20 h-20 border border-[#262626] bg-[#111111] flex items-center justify-center mx-auto mb-6 animate-pulse">
          <svg class="w-10 h-10 text-[#FF3D00]" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
          </svg>
        </div>
        <h1 class="text-4xl md:text-5xl font-bold tracking-[-0.04em] mb-2">{{ callState === 'idle' ? 'Ready to call' : 'Waiting for peer...' }}</h1>
        <p class="text-sm text-[#737373] type-label">Share room link with your peer</p>
      </div>

      <!-- Room link share card -->
      <div class="bg-[#0F0F0F] border border-[#262626] p-6 w-full max-w-md">
        <p class="type-label text-[#737373] mb-3">Room Link</p>
        <div class="flex gap-2">
          <input
            :value="shareUrl"
            readonly
            class="flex-1 bg-[#1A1A1A] border border-[#262626] px-4 h-12 text-sm text-[#FAFAFA] outline-none select-all"
            @click="(e) => (e.target as HTMLInputElement).select()"
          />
          <button
            @click="copyLink"
            class="h-12 px-5 border text-xs uppercase tracking-[0.1em] font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3D00] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0A]"
            :class="copied ? 'border-[#FAFAFA] bg-[#FAFAFA] text-[#0A0A0A]' : 'border-[#FF3D00] text-[#FF3D00] hover:bg-[#FF3D00] hover:text-[#0A0A0A]'"
          >
            {{ copied ? 'Copied!' : 'Copy' }}
          </button>
        </div>
      </div>

      <button
        v-if="callState === 'idle'"
        @click="initCall"
        class="h-12 px-8 border border-[#FAFAFA] text-[#FAFAFA] uppercase tracking-[0.1em] text-xs font-semibold hover:bg-[#FAFAFA] hover:text-[#0A0A0A] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3D00] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0A]"
      >
        Start Call
      </button>

      <button
        @click="endCall"
        class="h-11 px-7 border border-[#FF3D00] text-[#FF3D00] uppercase tracking-[0.1em] text-xs font-semibold hover:bg-[#FF3D00] hover:text-[#0A0A0A] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3D00] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0A]"
      >
        Cancel
      </button>
    </div>

    <!-- Active call -->
    <div v-else-if="callState === 'connected'" class="fixed inset-0 z-20 bg-black">
      <div class="relative w-screen h-dvh">
        <!-- Main stage -->
        <div class="w-full h-full overflow-hidden bg-black">
          <video
            v-if="remoteStream"
            ref="remoteVideoEl"
            :srcObject="remoteStream"
            autoplay
            playsinline
            :muted="remoteAudioBoostActive"
            class="w-full h-full object-contain"
          />
          <div v-else class="w-full h-full flex items-center justify-center text-white/70 text-sm">Connecting media...</div>
          <span class="absolute bottom-3 left-4 text-xs text-white/80 bg-black/40 px-3 py-1 rounded-full">
            {{ remoteHasVideo ? 'Remote' : 'Connecting' }}
          </span>
        </div>

        <!-- Self PiP -->
        <div v-if="localStream" class="absolute top-6 right-6 w-56 overflow-hidden bg-[#111111] border border-[#262626]">
          <video
            ref="localVideoEl"
            :srcObject="isScreenSharing ? screenStream : localStream"
            autoplay
            playsinline
            muted
            :class="[
              'w-full h-36 object-cover',
              isScreenSharing ? '' : '-scale-x-100'
            ]"
          />
          <span class="absolute bottom-2 left-2 text-[11px] text-white/90 bg-black/40 px-2 py-0.5">
            {{ isScreenSharing ? 'Screen' : 'You' }}
          </span>
        </div>

        <span v-if="isCameraOff && !isScreenSharing" class="absolute inset-0 flex items-center justify-center text-white/60 text-sm pointer-events-none">Camera off</span>
      </div>

      <!-- Floating control bar -->
      <div class="fixed bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center justify-center px-4 w-full pointer-events-none">
        <div class="pointer-events-auto bg-[#0F0F0F]/95 backdrop-blur-md px-6 py-3 border border-[#262626] flex items-center gap-4">
          <!-- Mute -->
          <button
            @click="toggleMute"
            :class="isMuted ? 'bg-[#B3261E] text-white' : 'bg-[#E8DEF8] text-[#1D192B] hover:bg-[#E8DEF8]/80'"
            class="w-12 h-12 flex items-center justify-center transition-all duration-150 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3D00]"
            :aria-label="isMuted ? 'Unmute' : 'Mute'"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path v-if="!isMuted" stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              <path v-else stroke-linecap="round" stroke-linejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.5a.75.75 0 01-.75-.75v-9a.75.75 0 01.75-.75h4.5z" />
            </svg>
          </button>

          <!-- Camera -->
          <button
            @click="toggleCamera"
            :class="isCameraOff ? 'bg-[#B3261E] text-white' : 'bg-[#E8DEF8] text-[#1D192B] hover:bg-[#E8DEF8]/80'"
            class="w-12 h-12 flex items-center justify-center transition-all duration-150 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3D00]"
            :aria-label="isCameraOff ? 'Turn camera on' : 'Turn camera off'"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
            </svg>
          </button>

          <!-- Screen share -->
          <button
            @click="isScreenSharing ? stopScreenShare() : startScreenShare()"
            :class="isScreenSharing ? 'bg-[#6750A4] text-white' : 'bg-[#E8DEF8] text-[#1D192B] hover:bg-[#E8DEF8]/80'"
            class="w-12 h-12 flex items-center justify-center transition-all duration-150 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3D00]"
            aria-label="Toggle screen share"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
            </svg>
          </button>

          <!-- Hang up -->
          <button
            @click="endCall"
            class="w-14 h-14 bg-[#FF3D00] text-[#0A0A0A] flex items-center justify-center hover:brightness-95 active:translate-y-px transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3D00] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            aria-label="End call"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Call ended -->
    <div v-else class="relative z-10 flex flex-col items-center justify-center flex-1 gap-6 px-4 text-center bg-[#0A0A0A]">
      <div class="w-20 h-20 border border-[#262626] bg-[#111111] flex items-center justify-center mx-auto">
        <svg class="w-10 h-10 text-[#FF3D00]" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18" />
        </svg>
      </div>
      <h2 class="text-4xl tracking-[-0.04em] font-bold">Call ended</h2>
      <button @click="$router.push({ name: 'home' })" class="h-12 px-8 border border-[#FAFAFA] text-[#FAFAFA] uppercase tracking-[0.1em] text-xs font-semibold hover:bg-[#FAFAFA] hover:text-[#0A0A0A] transition-colors duration-150">
        Back to Home
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWebRTC } from '../composables/useWebRTC'

const route = useRoute()
const router = useRouter()
const roomId = route.params.roomId as string

function getStablePeerId(room: string): string {
  const key = `p2p-peer:${room}`
  const existing = sessionStorage.getItem(key)
  if (existing) return existing
  const next = crypto.randomUUID()
  sessionStorage.setItem(key, next)
  return next
}

const peerId = getStablePeerId(roomId)
const shareUrl = `${location.origin}/room/${roomId}`
const copied = ref(false)
const callStarted = ref(false)

const {
  localStream, remoteStream, screenStream,
  remoteHasVideo,
  remoteAudioBoostActive,
  isScreenSharing, isMuted, isCameraOff, callState,
  startCall, startScreenShare, stopScreenShare,
  toggleMute, toggleCamera, hangUp,
} = useWebRTC(roomId, peerId)



async function initCall() {
  if (callStarted.value) return
  callStarted.value = true
  await startCall()
}

function endCall() {
  hangUp()
  router.replace({ name: 'home' })
}

async function copyLink() {
  await navigator.clipboard.writeText(shareUrl)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

// Auto-init for any participant opening this call link.
onMounted(() => {
  document.documentElement.style.overflow = 'hidden'
  document.body.style.overflow = 'hidden'
  void initCall()
})

onUnmounted(() => {
  document.documentElement.style.overflow = ''
  document.body.style.overflow = ''
})
</script>
