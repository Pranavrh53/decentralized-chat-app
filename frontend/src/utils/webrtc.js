import Peer from 'simple-peer';

// Globals
let currentPeer = null;
let ws = null;
let pollInterval = null;
let signalQueue = [];  // Dedupe signals
let lastSignalHash = '';  // Simple dedupe

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

export const createPeer = (initiator, localAddr, remoteAddr, onData, onConnect, onError) => {
  console.log(`[WebRTC] Creating ${initiator ? 'initiator' : 'responder'} peer: ${localAddr} ↔ ${remoteAddr}`);

  if (currentPeer) currentPeer.destroy();

  currentPeer = new Peer({
    initiator,
    trickle: false,  // Bundle candidates—avoids races
    config: { iceServers: ICE_SERVERS },
    objectMode: false,  // Changed to false to handle binary data properly
    channelConfig: {
      ordered: true,
      maxRetransmits: 10
    },
    sdpTransform: (sdp) => {
      // Ensure proper codec priority
      sdp = sdp.replace('useinbandfec=1', 'useinbandfec=1; stereo=1; maxaveragebitrate=510000');
      return sdp;
    }
  });

  if (currentPeer && currentPeer._pc) {
    currentPeer._pc.addEventListener('iceconnectionstatechange', () => {
      if (!currentPeer || !currentPeer._pc) return;
      const state = currentPeer._pc.iceConnectionState;
      console.log(`[WebRTC] ICE State: ${state}`);
      if (state === 'failed') onError(new Error('ICE failed'));
    });
  }

  currentPeer.on('signal', (data) => {
    console.log(`[WebRTC] Signal: ${data.type || 'candidate'}`, data);
    sendSignal(data, localAddr, remoteAddr);
  });

  currentPeer.on('connect', () => {
    console.log('[WebRTC] ✅ Connected!');
    if (onConnect) onConnect();
  });

  currentPeer.on('data', (data) => {
    try {
      let msg;
      if (typeof data === 'string') {
        msg = data;
      } else if (data instanceof ArrayBuffer) {
        msg = new TextDecoder().decode(data);
      } else if (data.data) {
        // Handle ArrayBufferView
        msg = new TextDecoder().decode(data.data || data);
      } else {
        msg = data.toString();
      }
      console.log('[WebRTC] Received raw data:', data);
      console.log('[WebRTC] Decoded message:', msg);
      if (onData) onData(msg);
    } catch (err) {
      console.error('[WebRTC] Error processing message:', err);
    }
  });

  currentPeer.on('error', (err) => {
    console.error('[WebRTC] Error:', err);
    console.error('Error details:', {
      code: err.code,
      errno: err.errno,
      message: err.message,
      type: err.type
    });
    if (onError) onError(err);
  });

  currentPeer.on('close', () => {
    console.log('[WebRTC] Connection closed');
    console.log('Connection state:', currentPeer._pc.connectionState);
    console.log('ICE connection state:', currentPeer._pc.iceConnectionState);
    cleanup();
  });

  // 120s timeout (longer for bundle)
  const timeoutId = setTimeout(() => {
    if (currentPeer && currentPeer._pc && currentPeer._pc.iceConnectionState !== 'connected') {
      console.log('[WebRTC] Connection timeout - destroying peer');
      onError(new Error('Connection timeout'));
      cleanup();
    }
  }, 120000);

  // Store timeout ID for cleanup
  currentPeer._timeoutId = timeoutId;

  return currentPeer;
};

const sendSignal = async (data, from, to) => {
  try {
    const endpoint = data.type === 'offer' ? '/offer' : data.type === 'answer' ? '/answer' : '/ice-candidate';
    const body = data.type === 'candidate' 
      ? { from_peer: from, to_peer: to, candidate: data }
      : { from_peer: from, to_peer: to, signal: data };

    const res = await fetch(`http://localhost:8000${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error('Signal send failed');
    console.log(`[WebRTC] Signal sent: ${data.type}`);
  } catch (err) {
    console.error('[WebRTC] Send error:', err);
  }
};

export const setupSignaling = (localAddr, onSignal, remoteAddr) => {
  // Cleanup first
  cleanup();

  const wsUrl = `ws://localhost:8000/ws/${localAddr}`;
  console.log(`[WebRTC] Connecting WS: ${wsUrl}`);
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[WebRTC] WS open—polling for signals');
    pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:8000/check/${localAddr}`);
        const data = await res.json();
        if (data.type === 'check' && (data.offer || data.answer || data.has_candidates)) {
          const hash = JSON.stringify(data);  // Dedupe
          if (hash === lastSignalHash) return;  // Skip duplicates
          lastSignalHash = hash;
          console.log('[WebRTC] Polled signal:', data);

          if (data.offer && !currentPeer) {
            // Auto-create responder on offer
            console.log('[WebRTC] Auto-creating responder for offer');
            currentPeer = createPeer(false, localAddr, remoteAddr, onDataFromGlobal, onConnectFromGlobal, onErrorFromGlobal);
            onSignal(data.offer);  // Set offer
          } else if (data.answer) {
            onSignal(data.answer);
          }
          if (data.candidates && data.candidates.length > 0) {
            data.candidates.forEach(cand => onSignal(cand));
          }
        }
      } catch (err) {
        console.warn('[WebRTC] Poll error:', err);
      }
    }, 1500);  // Slower poll to reduce races
  };

  ws.onmessage = (event) => {
    try {
      const signal = JSON.parse(event.data);
      if (signal.type && signal.signal) {
        console.log('[WebRTC] WS signal:', signal.type);
        onSignal(signal.signal);
      }
    } catch (err) {
      console.error('[WebRTC] WS parse error:', err);
    }
  };

  ws.onclose = () => {
    console.log('[WebRTC] WS closed');
    if (pollInterval) clearInterval(pollInterval);
  };
};

// Global callbacks (for auto-responder)
let globalOnData, globalOnConnect, globalOnError;
const onDataFromGlobal = (data) => globalOnData && globalOnData(data);
const onConnectFromGlobal = () => globalOnConnect && globalOnConnect();
const onErrorFromGlobal = (err) => globalOnError && globalOnError(err);

export const setGlobalCallbacks = (onData, onConnect, onError) => {
  globalOnData = onData;
  globalOnConnect = onConnect;
  globalOnError = onError;
};

export const cleanup = () => {
  console.log('[WebRTC] Cleaning up...');
  
  // Clear any pending timeouts
  if (currentPeer && currentPeer._timeoutId) {
    clearTimeout(currentPeer._timeoutId);
  }
  
  // Destroy peer if it exists
  if (currentPeer) {
    try {
      currentPeer.destroy();
    } catch (e) {
      console.warn('[WebRTC] Error during peer cleanup:', e);
    }
  }
  
  // Close WebSocket if it exists
  if (ws) {
    try {
      ws.close();
    } catch (e) {
      console.warn('[WebRTC] Error during WebSocket cleanup:', e);
    }
  }
  
  // Clear polling interval
  if (pollInterval) {
    clearInterval(pollInterval);
  }
  
  // Reset state
  signalQueue = [];
  lastSignalHash = '';
  currentPeer = null;
  ws = null;
  pollInterval = null;
  globalOnData = null;
  globalOnConnect = null;
  globalOnError = null;
  
  console.log('[WebRTC] Cleanup complete');
};