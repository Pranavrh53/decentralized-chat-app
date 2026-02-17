import Peer from 'simple-peer';

// Globals
let currentPeer = null;
let ws = null;
let pollInterval = null;
let lastSignalHash = '';
let localStream = null;

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443?transport=tcp',
      'turn:openrelay.metered.ca:443'
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

/**
 * Get user media (video/audio)
 * @param {boolean} video - Enable video
 * @param {boolean} audio - Enable audio
 * @returns {Promise<MediaStream>}
 */
export const getUserMedia = async (video = true, audio = true) => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video, audio });
    localStream = stream;
    console.log('[WebRTC] ✅ Got user media:', { video, audio });
    return stream;
  } catch (error) {
    console.error('[WebRTC] ❌ Failed to get user media:', error);
    throw error;
  }
};

/**
 * Stop local media stream
 */
export const stopUserMedia = () => {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
    console.log('[WebRTC] Stopped user media');
  }
};

/**
 * Toggle audio mute
 * @param {boolean} muted
 */
export const setAudioMuted = (muted) => {
  if (localStream) {
    localStream.getAudioTracks().forEach(track => {
      track.enabled = !muted;
    });
    console.log(`[WebRTC] Audio ${muted ? 'muted' : 'unmuted'}`);
  }
};

/**
 * Toggle video enabled
 * @param {boolean} enabled
 */
export const setVideoEnabled = (enabled) => {
  if (localStream) {
    localStream.getVideoTracks().forEach(track => {
      track.enabled = enabled;
    });
    console.log(`[WebRTC] Video ${enabled ? 'enabled' : 'disabled'}`);
  }
};

export const createPeer = (initiator, localAddr, remoteAddr, onData, onConnect, onError, stream = null, onStream = null) => {
  console.log(`[WebRTC] Creating ${initiator ? 'initiator' : 'responder'} peer: ${localAddr} ↔ ${remoteAddr}`);

  // Destroy old only if not connected
  if (currentPeer && currentPeer._pc && currentPeer._pc.iceConnectionState !== 'connected') {
    console.log('[WebRTC] Destroying old inactive peer');
    currentPeer.destroy();
  }

  const peerConfig = {
    initiator,
    trickle: true,
    config: { iceServers: ICE_SERVERS }
  };

  // Add stream if provided (for video/audio calls)
  if (stream) {
    peerConfig.stream = stream;
    console.log('[WebRTC] Adding local stream to peer');
  }

  currentPeer = new Peer(peerConfig);

  currentPeer._pc.addEventListener('iceconnectionstatechange', () => {
    const state = currentPeer._pc.iceConnectionState;
    console.log(`[WebRTC] ICE State: ${state}`);
    if (state === 'connected') {
      console.log('[WebRTC] ✅ WebRTC peer connection established!');
    }
    if (state === 'failed') onError(new Error('ICE failed'));
  });

  currentPeer.on('signal', (data) => {
    if (currentPeer.destroyed) return;  // Guard
    console.log(`[WebRTC] Signal generated: ${data.type || 'candidate'}`);
    console.log('[WebRTC] Signal data:', data);
    sendSignal(data, localAddr, remoteAddr);
  });

  currentPeer.on('connect', () => {
    console.log('[WebRTC] Channel connected!');
    if (onConnect) onConnect();
  });

  currentPeer.on('data', (data) => {
    const dataStr = data.toString();
    console.log('[WebRTC] 📨 Data received (raw):', dataStr);
    try {
      const parsed = JSON.parse(dataStr);
      console.log('[WebRTC] 📦 Parsed data type:', parsed.type);
    } catch (e) {
      console.log('[WebRTC] Not JSON data');
    }
    if (onData) onData(dataStr);
  });

  currentPeer.on('stream', (stream) => {
    console.log('[WebRTC] ✅ Remote stream received!');
    if (onStream) onStream(stream);
  });

  currentPeer.on('error', (err) => {
    console.error('[WebRTC] Error:', err);
    if (onError) onError(err);
  });

  currentPeer.on('close', () => {
    console.log('[WebRTC] Close');
  });

  // Timeout
  setTimeout(() => {
    if (currentPeer && currentPeer._pc && currentPeer._pc.iceConnectionState !== 'connected') {
      onError(new Error('Timeout'));
      currentPeer.destroy();
    }
  }, 90000);

  return currentPeer;
};

const SIGNALING_SERVER = process.env.REACT_APP_SIGNALING_SERVER || 'http://localhost:8000';
const WS_SERVER = process.env.REACT_APP_WS_SERVER || 'ws://localhost:8000';

const sendSignal = async (data, from, to) => {
  try {
    const endpoint = data.type === 'offer' ? '/offer' : data.type === 'answer' ? '/answer' : '/ice-candidate';
    const body = data.type === 'candidate' ? { from_peer: from, to_peer: to, candidate: data } : { from_peer: from, to_peer: to, signal: data };

    console.log(`[WebRTC] Sending ${data.type || 'candidate'} to ${to} via ${SIGNALING_SERVER}${endpoint}`);
    console.log('[WebRTC] Request body:', JSON.stringify(body, null, 2));
    
    const res = await fetch(`${SIGNALING_SERVER}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`[WebRTC] Send failed with status ${res.status}:`, error);
      throw new Error(`Send failed: ${error}`);
    }
    
    const responseData = await res.json();
    console.log(`[WebRTC] ✅ Signal sent successfully: ${data.type || 'candidate'}`, responseData);
  } catch (err) {
    console.error('[WebRTC] Send error:', err);
    // You might want to add retry logic here
  }
};

export const setupSignaling = (localAddr, onSignal, remoteAddr) => {
  console.log('[WebRTC] ===== SETUP SIGNALING =====');
  console.log('[WebRTC] Local address:', localAddr);
  console.log('[WebRTC] Remote address:', remoteAddr);
  
  cleanup(false);  // Non-force

  const wsUrl = `${WS_SERVER}/ws/${localAddr}`;
  console.log(`[WebRTC] Connecting WebSocket: ${wsUrl}`);
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[WebRTC] ✅ WebSocket connected successfully');
    pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:8000/check/${localAddr}`);
        const data = await res.json();
        if (data.offer || data.answer || data.candidates?.length > 0) {
          const hash = JSON.stringify(data);
          if (hash === lastSignalHash) return;
          lastSignalHash = hash;
          console.log('[WebRTC] Polled:', data);

          // Always signal up to the Chat layer - let it handle peer creation
          if (data.offer) {
            console.log('[WebRTC] Passing offer signal up');
            onSignal(data.offer);
          }
          if (data.answer) {
            console.log('[WebRTC] Passing answer signal up');
            onSignal(data.answer);
          }
          if (data.candidates && data.candidates.length > 0) {
            console.log('[WebRTC] Passing', data.candidates.length, 'candidates up');
            data.candidates.forEach(cand => onSignal(cand));
          }
        }
      } catch (err) {
        console.warn('[WebRTC] Poll error:', err);
      }
    }, 1000);
  };

  ws.onmessage = (event) => {
    try {
      const signal = JSON.parse(event.data);
      if (signal.type && signal.signal) {
        console.log('[WebRTC] WS signal:', signal.type);
        if (currentPeer && !currentPeer.destroyed && currentPeer._pc && currentPeer._pc.signalingState !== 'stable') {
          currentPeer.signal(signal.signal);
        }
      }
    } catch (err) {
      console.error('[WebRTC] WS parse:', err);
    }
  };

  ws.onclose = () => {
    console.warn('[WebRTC] ⚠️ WebSocket closed');
    if (pollInterval) clearInterval(pollInterval);
  };

  ws.onerror = (error) => {
    console.error('[WebRTC] ❌ WebSocket error:', error);
  };
};

export const setGlobalCallbacks = (onData, onConnect, onError) => {
  // Legacy function - callbacks are now passed directly to createPeer
  // Kept for compatibility
};

export const cleanup = (force = false) => {
  if (!force && currentPeer && currentPeer._pc && currentPeer._pc.iceConnectionState === 'connected') {
    console.log('[WebRTC] Skipping cleanup—connected');
    return;
  }
  console.log('[WebRTC] Cleanup (force:', force, ')');
  if (currentPeer) {
    try {
      currentPeer.destroy();
    } catch (e) {
      console.warn('[WebRTC] Error destroying peer:', e);
    }
  }
  if (ws) {
    try {
      // Only close if WebSocket is OPEN or CONNECTING
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    } catch (e) {
      console.warn('[WebRTC] Error closing WebSocket:', e);
    }
  }
  if (pollInterval) clearInterval(pollInterval);
  stopUserMedia();
  currentPeer = null;
  ws = null;
  pollInterval = null;
  lastSignalHash = '';
};