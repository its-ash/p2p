<template>
  <div class="min-h-dvh bg-[#0A0A0A] text-[#FAFAFA] flex flex-col relative overflow-hidden">
    <div aria-hidden="true" class="pointer-events-none absolute right-4 top-8 text-[4rem] md:text-[7rem] font-black tracking-[-0.06em] text-[#1A1A1A] leading-none">BROWSE</div>

    <!-- Header bar -->
    <header class="relative z-10 flex items-center gap-3 px-6 py-4 border-b border-[#262626] bg-[#0A0A0A]/95 backdrop-blur-sm">
      <button @click="$router.push({ name: 'home' })" class="h-9 px-3 border border-[#FAFAFA] text-[#FAFAFA] text-xs uppercase tracking-[0.1em] font-semibold hover:bg-[#FAFAFA] hover:text-[#0A0A0A] transition-colors duration-150" aria-label="Cancel">
        Cancel
      </button>

      <!-- Breadcrumb -->
      <nav class="flex items-center gap-1 flex-1 min-w-0">
        <button
          v-for="(crumb, i) in breadcrumbs"
          :key="i"
          @click="navigateTo(i)"
          class="flex items-center gap-1 text-sm transition-colors duration-200"
          :class="i === breadcrumbs.length - 1 ? 'text-[#FAFAFA] font-medium' : 'text-[#FF3D00] hover:text-[#FF3D00]/70'"
        >
          <span class="truncate max-w-[120px]">{{ crumb }}</span>
          <svg v-if="i < breadcrumbs.length - 1" class="w-4 h-4 text-[#737373] flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </nav>

      <!-- Connection badge -->
      <span class="flex-shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1 border"
        :class="connected ? 'border-[#FF3D00] text-[#FF3D00]' : 'border-[#262626] text-[#737373]'">
        <span class="w-2 h-2" :class="connected ? 'bg-[#FF3D00]' : 'bg-[#737373]'" />
        {{ connected ? 'Connected' : 'Connecting…' }}
      </span>
    </header>

    <!-- Loading -->
    <div v-if="!tree && dataConnected" class="relative z-10 flex-1 flex items-center justify-center">
      <div class="text-center">
        <div class="w-12 h-12 border-2 border-[#262626] border-t-[#FF3D00] animate-spin mx-auto mb-4" />
        <p class="text-sm text-[#737373]">Loading file tree…</p>
      </div>
    </div>

    <!-- Not connected -->
    <div v-else-if="!connected || !dataConnected" class="relative z-10 flex-1 flex items-center justify-center px-4">
      <div class="text-center max-w-xs">
        <div class="w-16 h-16 border border-[#262626] bg-[#111111] flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-[#FF3D00]" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
        </div>
        <h2 class="text-2xl tracking-[-0.04em] font-bold mb-2">Connecting to host…</h2>
        <p class="text-sm text-[#737373]">Waiting for the host to be online.</p>
        <p v-if="signalingError" class="mt-3 text-xs text-[#FF3D00] border border-[#FF3D00] bg-[#1A1A1A] px-3 py-2 break-all text-left">
          {{ signalingError }}
        </p>
      </div>
    </div>

    <!-- File explorer -->
    <main v-else-if="currentNode" class="relative z-10 flex-1 px-4 py-6 max-w-6xl mx-auto w-full">
      <div class="bg-[#0F0F0F] border border-[#262626] p-4 md:p-6">
        <!-- Directory contents -->
        <div v-if="currentNode.type === 'directory'" class="min-h-[360px]">
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div
              v-for="child in currentNode.children"
              :key="child.path"
              @click="handleNodeClick(child)"
              class="group border border-[#262626] bg-[#111111] hover:bg-[#171717] cursor-pointer p-3 transition-colors duration-150"
            >
              <div class="h-20 flex items-center justify-center border border-[#262626] bg-[#1A1A1A] mb-3">
                <svg v-if="child.type === 'directory'" class="w-10 h-10 text-[#FF3D00]" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
                <svg v-else class="w-10 h-10 text-[#FAFAFA]" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>

              <p class="text-sm font-medium text-[#FAFAFA] truncate">{{ child.name }}</p>
              <p class="text-xs text-[#737373] mt-1 truncate">
                {{ child.type === 'directory' ? (child.loaded === false ? 'Open to load' : `${child.children?.length ?? 0} items`) : formatSize(child.size) }}
              </p>

              <div v-if="transferProgress[child.path] !== undefined && transferProgress[child.path] < 100" class="mt-2">
                <div class="h-1.5 bg-[#1A1A1A] overflow-hidden">
                  <div class="h-full bg-[#FF3D00] transition-all duration-300" :style="{ width: transferProgress[child.path] + '%' }" />
                </div>
              </div>

              <a
                v-if="receivedFiles[child.path]"
                :href="receivedFiles[child.path].url"
                :download="child.name"
                @click.stop
                class="mt-2 inline-flex items-center gap-1 text-[10px] text-[#FF3D00] font-semibold border border-[#FF3D00] px-2 py-1 uppercase tracking-[0.08em] hover:bg-[#FF3D00] hover:text-[#0A0A0A] transition-colors duration-150"
              >
                Save
              </a>
            </div>
          </div>

          <div v-if="currentNode.loaded === false" class="px-6 py-12 text-center text-sm text-[#737373]">
            Loading folder...
          </div>
          <div v-else-if="!currentNode.children?.length" class="px-6 py-12 text-center text-sm text-[#737373]">
            Empty folder
          </div>
        </div>

        <!-- Single file -->
        <div v-else class="p-8 text-center">
          <div class="w-16 h-16 border border-[#262626] bg-[#1A1A1A] flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-[#FF3D00]" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <h2 class="text-lg font-medium text-[#FAFAFA] mb-1">{{ currentNode.name }}</h2>
          <p class="text-sm text-[#737373] mb-6">{{ formatSize(currentNode.size) }}</p>

          <!-- Download progress -->
          <div v-if="transferProgress[currentNode.path] !== undefined && transferProgress[currentNode.path] < 100" class="max-w-xs mx-auto mb-4">
            <div class="h-2 bg-[#1A1A1A] overflow-hidden">
              <div class="h-full bg-[#FF3D00] transition-all duration-300" :style="{ width: transferProgress[currentNode.path] + '%' }" />
            </div>
            <p class="text-xs text-[#737373] mt-2">{{ transferProgress[currentNode.path] }}%</p>
          </div>

          <a
            v-if="receivedFiles[currentNode.path]"
            :href="receivedFiles[currentNode.path].url"
            :download="currentNode.name"
            class="inline-flex items-center gap-2 h-12 px-8 border border-[#FF3D00] text-[#FF3D00] uppercase tracking-[0.1em] text-xs font-semibold hover:bg-[#FF3D00] hover:text-[#0A0A0A] transition-colors duration-150"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download
          </a>
          <button
            v-else-if="transferProgress[currentNode.path] === undefined"
            @click="requestFile(currentNode)"
            class="inline-flex items-center gap-2 h-12 px-8 border border-[#FAFAFA] text-[#FAFAFA] uppercase tracking-[0.1em] text-xs font-semibold hover:bg-[#FAFAFA] hover:text-[#0A0A0A] transition-colors duration-150"
          >
            Get file
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useFileShare, type FileNode } from '../composables/useFileShare'

const route = useRoute()
const roomId = route.params.roomId as string

function getStablePeerId(room: string): string {
  const key = `p2p-peer:${room}:files`
  const existing = sessionStorage.getItem(key)
  if (existing) return existing
  const next = crypto.randomUUID()
  sessionStorage.setItem(key, next)
  return next
}

const peerId = getStablePeerId(roomId)

const { tree, transferProgress, receivedFiles, guestJoin, requestFile, requestDirectory, connected, dataConnected, signalingError } = useFileShare(roomId, peerId, false)

const navStack = ref<FileNode[]>([])

const currentNode = computed<FileNode | null>(() => {
  if (!tree.value) return null
  if (!navStack.value.length) return tree.value
  return navStack.value[navStack.value.length - 1]
})

const breadcrumbs = computed(() => {
  const crumbs = [tree.value?.name ?? 'Root']
  for (const n of navStack.value) crumbs.push(n.name)
  return crumbs
})

function navigateTo(index: number) {
  if (index === 0) { navStack.value = []; return }
  navStack.value = navStack.value.slice(0, index)
}

function handleNodeClick(node: FileNode) {
  if (node.type === 'directory') {
    if (node.loaded === false) {
      requestDirectory(node.path)
    }
    navStack.value = [...navStack.value, node]
  } else {
    requestFile(node)
  }
}

function formatSize(bytes?: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

onMounted(() => guestJoin())
</script>
