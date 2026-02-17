import Peer from 'simple-peer';

// Cache buster - increment to force reload
console.log('[webrtc.js] 🔥 LOADED - Version 7.0 - FIXED STREAM EVENTS 🔥');

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
/**
 * Get user media (video/audio)
 * @param {boolean} video - Enable video
 * @param {boolean} audio - Enable audio
 * @returns {Promise<MediaStream>}
 */
export const getUserMedia = async (video = true, audio = true) => {
  try {
    console.log('[WebRTC] 🎤 Requesting user media:', { video, audio });
    const stream = await navigator.mediaDevices.getUserMedia({ video, audio });
    localStream = stream;
    console.log('[WebRTC] ✅ Got user media:', { video, audio });
    console.log('[WebRTC] Stream tracks:', stream.getTracks().map(t => `${t.kind}: ${t.label}`));
    return stream;
  } catch (error) {
    console.error('[WebRTC] ❌ Failed to get user media:', error.name, error.message);
    
    // If video was requested but failed, try audio-only as fallback
    if (video && audio && error.name === 'NotReadableError') {
      console.log('[WebRTC] 🔁 Camera in use or unavailable, trying audio-only fallback...');
      try {
        const audioOnlyStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        localStream = audioOnlyStream;
        console.log('[WebRTC] ✅ Got audio-only stream as fallback');
        return audioOnlyStream;
      } catch (audioError) {
        console.error('[WebRTC] ❌ Audio fallback also failed:', audioError);
        throw new Error(`Microphone access failed: ${audioError.message}`);
      }
    }
    
    // Provide user-friendly error messages
    if (error.name === 'NotAllowedError') {
      throw new Error('Camera/microphone permission denied. Please allow access in your browser.');
    } else if (error.name === 'NotFoundError') {
      throw new Error('No camera or microphone found. Please connect a device.');
    } else if (error.name === 'NotReadableError') {
      throw new Error('Camera or microphone is already in use by another application. Please close other apps using the camera/mic.');
    } else if (error.name === 'OverconstrainedError') {
      throw new Error('Camera or microphone does not meet the requirements.');
    } else {
      throw new Error(`Media access error: ${error.message}`);
    }
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
  console.log(`[WebRTC] ===== CREATING PEER =====`);
  console.log(`[WebRTC] Creating ${initiator ? 'initiator' : 'responder'} peer: ${localAddr} ↔ ${remoteAddr}`);
  console.log(`[WebRTC] Has stream:`, !!stream, 'Has onStream:', !!onStream);

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

  console.log('[WebRTC] Creating Peer with config:', peerConfig);
  currentPeer = new Peer(peerConfig);
  console.log('[WebRTC] ✅ Peer object created, initiator:', initiator);

  currentPeer._pc.addEventListener('iceconnectionstatechange', () => {
    const state = currentPeer._pc.iceConnectionState;
    console.log(`[WebRTC] 🧊 ICE State: ${state}`);
    if (state === 'connected') {
      console.log('[WebRTC] ✅ WebRTC peer connection established!');
    }
    if (state === 'completed') {
      console.log('[WebRTC] ✅ ICE gathering completed!');
    }
    if (state === 'failed') {
      console.error('[WebRTC] ❌ ICE connection failed');
      if (onError) onError(new Error('ICE failed'));
    }
  });

  currentPeer.on('signal', (data) => {
    if (currentPeer.destroyed) return;  // Guard
    console.log(`[WebRTC] Signal generated: ${data.type || 'candidate'}`);
    console.log('[WebRTC] Signal data:', data);
    sendSignal(data, localAddr, remoteAddr);
  });

  currentPeer.on('connect', () => {
    console.log('[WebRTC] ✅✅✅ DATA CHANNEL CONNECTED! ✅✅✅');
    console.log('[WebRTC] onConnect callback will be called');
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
    console.log('[WebRTC] Stream tracks:', stream.getTracks().map(t => `${t.kind}: ${t.enabled}`));
    if (onStream) {
      console.log('[WebRTC] Calling onStream callback');
      onStream(stream);
    } else {
      console.warn('[WebRTC] ⚠️ No onStream callback provided!');
    }
  });

  // Also listen for track events (fired when tracks are added after connection)
  currentPeer.on('track', (track, stream) => {
    console.log('[WebRTC] 🎵 Track received:', track.kind);
    console.log('[WebRTC] Track stream:', stream);
    if (onStream) {
      console.log('[WebRTC] Calling onStream callback from track event');
      onStream(stream);
    }
  });

  currentPeer.on('error', (err) => {
    console.error('[WebRTC] Error:', err);
    if (onError) onError(err);
  });

  currentPeer.on('close', () => {
    console.log('[WebRTC] Close');
  });

  // Extended timeout - only destroy if completely failed
  const timeoutHandle = setTimeout(() => {
    if (currentPeer && currentPeer._pc) {
      const state = currentPeer._pc.iceConnectionState;
      console.log(`[WebRTC] Timeout check - ICE state: ${state}`);
      
      // Only destroy if failed or disconnected, not if still connecting
      if (state === 'failed' || state === 'closed') {
        console.warn('[WebRTC] Connection timeout - destroying peer');
        if (onError) onError(new Error('Connection failed'));
        currentPeer.destroy();
      } else if (state === 'new' || state === 'checking') {
        console.warn('[WebRTC] Still connecting after timeout, giving more time...');
        // Don't destroy, let it keep trying
      }
    }
  }, 120000); // Extended to 120 seconds

  // Store timeout handle so it can be cleared
  if (currentPeer) {
    currentPeer._timeoutHandle = timeoutHandle;
  }

  return currentPeer;
};

const SIGNALING_SERVER = process.env.REACT_APP_SIGNALING_SERVER || 'http://localhost:8000';
const WS_SERVER = process.env.REACT_APP_WS_SERVER || 'ws://localhost:8000';

const sendSignal = async (data, from, to) => {
  try {
    // Normalize addresses to lowercase for backend consistency
    from = from.toLowerCase();
    to = to.toLowerCase();
    
    // Handle different signal types
    let endpoint;
    let body;
    
    if (data.type === 'offer') {
      endpoint = '/offer';
      body = { from_peer: from, to_peer: to, signal: data };
    } else if (data.type === 'answer') {
      endpoint = '/answer';
      body = { from_peer: from, to_peer: to, signal: data };
    } else if (data.type === 'candidate' || data.candidate) {
      endpoint = '/ice-candidate';
      body = { from_peer: from, to_peer: to, candidate: data };
    } else if (data.type === 'renegotiate') {
      // Renegotiate is an internal signal - just log it, don't send to server
      console.log('[WebRTC] 🔄 Renegotiate signal (internal, not sending to server)');
      return;
    } else {
      console.warn('[WebRTC] ⚠️ Unknown signal type:', data.type, '- ignoring');
      return;
    }

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
    // Don't throw - allow connection to continue
  }
};

export const setupSignaling = (localAddr, onSignal, remoteAddr) => {
  console.log('[WebRTC] ===== SETUP SIGNALING =====');
  console.log('[WebRTC] Local address:', localAddr);
  console.log('[WebRTC] Remote address:', remoteAddr);
  
  // Normalize addresses to lowercase
  localAddr = localAddr.toLowerCase();
  if (remoteAddr) {
    remoteAddr = remoteAddr.toLowerCase();
  }
  
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
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };

  ws.onerror = (error) => {
    console.error('[WebRTC] ❌ WebSocket error:', error);
    // Don't destroy - let polling continue as fallback
    // Mark ws as errored so we don't try to use it
    if (ws) {
      ws._hasError = true;
    }
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
      // Clear timeout if exists
      if (currentPeer._timeoutHandle) {
        clearTimeout(currentPeer._timeoutHandle);
      }
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
  if (pollInterval) {
    clearInterval(pollInterval);
  }
  stopUserMedia();
  currentPeer = null;
  ws = null;
  pollInterval = null;
  lastSignalHash = '';
};