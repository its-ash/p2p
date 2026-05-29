import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/room/:roomId', name: 'room-entry', component: () => import('../views/RoomEntryView.vue') },
    { path: '/call/:roomId', name: 'video-call', component: () => import('../views/VideoCallView.vue') },
    { path: '/share/:roomId', name: 'file-share', component: () => import('../views/FileShareView.vue') },
    { path: '/files/:roomId', name: 'file-explorer', component: () => import('../views/FileExplorerView.vue') },
  ],
})

export default router
