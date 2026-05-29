import { ref, onUnmounted } from 'vue'
import { useSignaling } from './useSignaling'

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

const VIDEO_CODEC_PRIORITY = ['AV1', 'VP9', 'VP8', 'H264']
const REMOTE_AUDIO_GAIN = 1.8

function applySenderQuality(sender: RTCRtpSender, kind: 'audio' | 'video') {
  const params = sender.getParameters()
  const current = params.encodings?.[0] ?? {}

  if (kind === 'audio') {
    params.encodings = [{ ...current, priority: 'high', networkPriority: 'high' } as RTCRtpEncodingParameters]
    sender.setParameters(params).catch(() => {})
    return
  }

  params.degradationPreference = 'maintain-framerate'
  params.encodings = [
    {
      ...current,
      priority: 'medium',
      networkPriority: 'high',
      maxBitrate: 1_200_000,
      maxFramerate: 30,
    } as RTCRtpEncodingParameters,
  ]
  sender.setParameters(params).catch(() => {})
}

function setBestDeviceSupportedCodecs(pc: RTCPeerConnection) {
  if (!pc.getTransceivers || !(RTCRtpSender as any).getCapabilities) return

  const caps = (RTCRtpSender as any).getCapabilities('video')
  const codecs = caps?.codecs
  if (!codecs?.length) return

  const preferred = VIDEO_CODEC_PRIORITY.flatMap((name) =>
    codecs.filter((c: any) => c.mimeType.toLowerCase().includes(name.toLowerCase()))
  )
  const rest = codecs.filter(
    (c: any) => !VIDEO_CODEC_PRIORITY.some((n) => c.mimeType.toLowerCase().includes(n.toLowerCase()))
  )

  pc.getTransceivers().forEach((t) => {
    if (t.sender.track?.kind !== 'video') return
    try { t.setCodecPreferences([...preferred, ...rest]) } catch { /* unsupported in some browsers */ }
  })
}

export function useWebRTC(roomId: string, peerId: string) {
  const localStream = ref<MediaStream | null>(null)
  const remoteStream = ref<MediaStream | null>(null)
  const remoteHasVideo = ref(false)
  const screenStream = ref<MediaStream | null>(null)
  const isScreenSharing = ref(false)
  const isMuted = ref(false)
  const isCameraOff = ref(false)
  const remoteAudioBoostActive = ref(false)
  const callState = ref<'idle' | 'connecting' | 'connected' | 'ended'>('idle')

  let pc: RTCPeerConnection | null = null
  let hasSentOffer = false
  let endedByUser = false
  let remoteMediaStream: MediaStream = new MediaStream()
  let remoteAudioContext: AudioContext | null = null
  let remoteAudioSource: MediaStreamAudioSourceNode | null = null
  let remoteAudioGainNode: GainNode | null = null
  const sig = useSignaling(roomId, peerId)

  async function applyRemoteAudioBoost(stream: MediaStream) {
    if (!stream.getAudioTracks().length) return
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext
      if (!Ctx) return
      if (!remoteAudioContext || remoteAudioContext.state === 'closed') {
        remoteAudioContext = new Ctx()
      }
      if (remoteAudioContext.state === 'suspended') {
        await remoteAudioContext.resume()
      }

      remoteAudioSource?.disconnect()
      remoteAudioGainNode?.disconnect()

      remoteAudioSource = remoteAudioContext.createMediaStreamSource(stream)
      remoteAudioGainNode = remoteAudioContext.createGain()
      remoteAudioGainNode.gain.value = REMOTE_AUDIO_GAIN

      remoteAudioSource.connect(remoteAudioGainNode)
      remoteAudioGainNode.connect(remoteAudioContext.destination)
      remoteAudioBoostActive.value = true
    } catch {
      remoteAudioBoostActive.value = false
      // Ignore boost setup issues on unsupported browsers.
    }
  }

  function clearRemoteAudioBoost() {
    remoteAudioSource?.disconnect()
    remoteAudioGainNode?.disconnect()
    remoteAudioSource = null
    remoteAudioGainNode = null
    remoteAudioBoostActive.value = false
  }

  async function sendOfferIfNeeded(targetPeerId: string | null) {
    if (!pc || !targetPeerId || hasSentOffer) return
    // Deterministic election: lexicographically smaller peer_id sends the offer.
    if (peerId.localeCompare(targetPeerId) >= 0) return
    hasSentOffer = true
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    sig.send({ type: 'offer', sdp: offer.sdp, from: peerId, to: targetPeerId })
  }

  async function startCall() {
    endedByUser = false
    callState.value = 'connecting'

    // Camera + mic – prefer best video codec available
    localStream.value = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 },
    })

    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    remoteMediaStream = new MediaStream()
    remoteStream.value = remoteMediaStream

    // Audio tracks get high priority
    localStream.value.getTracks().forEach((track) => {
      const sender = pc!.addTrack(track, localStream.value!)
      applySenderQuality(sender, track.kind as 'audio' | 'video')
      if (track.kind === 'video') track.contentHint = 'motion'
    })

    // Prefer the best codec actually supported on this device/browser.
    setBestDeviceSupportedCodecs(pc)

    pc.ontrack = (e) => {
      remoteStream.value = remoteMediaStream
      const incoming = e.streams[0]
      if (incoming) {
        incoming.getTracks().forEach((t) => {
          if (!remoteMediaStream.getTracks().some((rt) => rt.id === t.id)) {
            remoteMediaStream.addTrack(t)
          }
          if (t.kind === 'video') {
            remoteHasVideo.value = true
          }
          if (t.kind === 'audio') {
            void applyRemoteAudioBoost(remoteMediaStream)
          }
          t.onended = () => {
            remoteHasVideo.value = remoteMediaStream.getVideoTracks().some((vt) => vt.readyState === 'live')
            if (t.kind === 'audio' && !remoteMediaStream.getAudioTracks().some((at) => at.readyState === 'live')) {
              clearRemoteAudioBoost()
            }
          }
        })
      } else {
        // Some browsers provide streamless tracks; attach track directly.
        const t = e.track
        if (!remoteMediaStream.getTracks().some((rt) => rt.id === t.id)) {
          remoteMediaStream.addTrack(t)
        }
        if (t.kind === 'video') {
          remoteHasVideo.value = true
        }
        if (t.kind === 'audio') {
          void applyRemoteAudioBoost(remoteMediaStream)
        }
        t.onended = () => {
          remoteHasVideo.value = remoteMediaStream.getVideoTracks().some((vt) => vt.readyState === 'live')
          if (t.kind === 'audio' && !remoteMediaStream.getAudioTracks().some((at) => at.readyState === 'live')) {
            clearRemoteAudioBoost()
          }
        }
      }
    }

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
      if (pc?.connectionState === 'connected') callState.value = 'connected'
      if ((pc?.connectionState === 'failed' || pc?.connectionState === 'disconnected' || pc?.connectionState === 'closed') && !endedByUser) {
        hasSentOffer = false
        callState.value = 'connecting'
      }
    }

    sig.on('offer', async (msg: any) => {
      await pc!.setRemoteDescription({ type: 'offer', sdp: msg.sdp })
      const answer = await pc!.createAnswer()
      await pc!.setLocalDescription(answer)
      sig.send({ type: 'answer', sdp: answer.sdp, from: peerId, to: msg.from })
    })

    sig.on('answer', async (msg: any) => {
      await pc!.setRemoteDescription({ type: 'answer', sdp: msg.sdp })
    })

    sig.on('ice_candidate', async (msg: any) => {
      try {
        await pc!.addIceCandidate({ candidate: msg.candidate, sdpMid: msg.sdp_mid, sdpMLineIndex: msg.sdp_mline_index })
      } catch { /* ignore stale */ }
    })

    sig.on('peer_joined', async (msg: any) => {
      await sendOfferIfNeeded(msg.peer_id ?? sig.remotePeerId.value)
    })

    sig.on('pong', async (msg: any) => {
      const availablePeer = (msg.peers ?? []).find((id: string) => id !== peerId) ?? sig.remotePeerId.value
      await sendOfferIfNeeded(availablePeer)
    })

    sig.on('peer_left', () => {
      if (!endedByUser) {
        remoteMediaStream.getTracks().forEach((t) => remoteMediaStream.removeTrack(t))
        remoteStream.value = remoteMediaStream
        remoteHasVideo.value = false
        clearRemoteAudioBoost()
        hasSentOffer = false
        callState.value = 'connecting'
      }
    })

    sig.connect()

    // If already a peer in the room, elected side initiates immediately.
    void sendOfferIfNeeded(sig.remotePeerId.value)
  }

  async function startScreenShare() {
    const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
    screenStream.value = display
    isScreenSharing.value = true

    const videoTrack = display.getVideoTracks()[0]
    if (videoTrack) videoTrack.contentHint = 'detail'
    const sender = pc?.getSenders().find((s) => s.track?.kind === 'video')
    if (sender && videoTrack) await sender.replaceTrack(videoTrack)

    videoTrack.onended = () => stopScreenShare()
  }

  async function stopScreenShare() {
    isScreenSharing.value = false
    screenStream.value?.getTracks().forEach((t) => t.stop())
    screenStream.value = null

    const camTrack = localStream.value?.getVideoTracks()[0]
    const sender = pc?.getSenders().find((s) => s.track?.kind === 'video')
    if (sender && camTrack) await sender.replaceTrack(camTrack)
  }

  function toggleMute() {
    isMuted.value = !isMuted.value
    localStream.value?.getAudioTracks().forEach((t) => { t.enabled = !isMuted.value })
  }

  function toggleCamera() {
    isCameraOff.value = !isCameraOff.value
    localStream.value?.getVideoTracks().forEach((t) => { t.enabled = !isCameraOff.value })
  }

  function hangUp() {
    endedByUser = true
    pc?.close()
    pc = null
    hasSentOffer = false
    localStream.value?.getTracks().forEach((t) => t.stop())
    screenStream.value?.getTracks().forEach((t) => t.stop())
    clearRemoteAudioBoost()
    if (remoteAudioContext && remoteAudioContext.state !== 'closed') {
      void remoteAudioContext.close()
    }
    remoteAudioContext = null
    localStream.value = null
    screenStream.value = null
    remoteStream.value = null
    remoteHasVideo.value = false
    callState.value = 'ended'
    sig.disconnect()
  }

  onUnmounted(hangUp)

  return {
    localStream, remoteStream, screenStream,
    remoteHasVideo,
    remoteAudioBoostActive,
    isScreenSharing, isMuted, isCameraOff, callState,
    startCall, startScreenShare, stopScreenShare,
    toggleMute, toggleCamera, hangUp,
    remotePeerId: sig.remotePeerId,
  }
}
