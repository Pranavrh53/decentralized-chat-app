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

  if (currentPeer) {
    console.log('[WebRTC] Destroying existing peer connection');
    currentPeer.destroy();
    currentPeer = null;
  }

  try {
    currentPeer = new Peer({
      initiator,
      trickle: true,
      reconnectTimer: 3000,
      config: { 
        iceServers: ICE_SERVERS,
        iceTransportPolicy: 'all',
        iceCandidatePoolSize: 10
      },
      objectMode: false,
      channelConfig: {
        ordered: true,
        maxRetransmits: 10
      },
      sdpTransform: (sdp) => {
        // Ensure proper codec priority
        sdp = sdp.replace('useinbandfec=1', 'useinbandfec=1; stereo=1; maxaveragebitrate=510000');
        console.log('[WebRTC] SDP:', sdp);
        return sdp;
      }
    });

    // Add ICE connection state change handler
    if (currentPeer && currentPeer._pc) {
      currentPeer._pc.addEventListener('iceconnectionstatechange', () => {
        if (!currentPeer || !currentPeer._pc) return;
        const state = currentPeer._pc.iceConnectionState;
        console.log(`[WebRTC] ICE Connection State: ${state}`);
        
        if (state === 'failed') {
          console.log('[WebRTC] ICE failed, attempting to restart...');
          currentPeer.restartIce();
          if (onError) onError(new Error('ICE connection failed'));
        } else if (state === 'disconnected') {
          console.log('[WebRTC] ICE disconnected, attempting to reconnect...');
          currentPeer.restartIce();
        } else if (state === 'connected') {
          console.log('[WebRTC] ICE connected successfully');
        }
      });
    }

    // Signal event handler
    currentPeer.on('signal', (data) => {
      console.log(`[WebRTC] Signal (${data.type || 'candidate'})`);
      sendSignal(data, localAddr, remoteAddr);
    });

    // Connection established
    currentPeer.on('connect', () => {
      console.log('[WebRTC] ✅ Peer connection established!');
      console.log('[WebRTC] Local Description:', currentPeer.localDescription);
      console.log('[WebRTC] Remote Description:', currentPeer.remoteDescription);
      if (onConnect) onConnect();
    });

    // ICE state changes
    currentPeer.on('iceStateChange', (state) => {
      console.log(`[WebRTC] ICE State Change: ${state}`);
    });

    // Signal state changes
    currentPeer.on('signalStateChange', (state) => {
      console.log(`[WebRTC] Signal State: ${state}`);
      if (state === 'have-remote-offer') {
        console.log('[WebRTC] Processing remote offer');
      }
    });

    // Data channel message handler
    currentPeer.on('data', (data) => {
      console.log('[WebRTC] Received data, type:', typeof data);
      
      try {
        let message;
        if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
          const decoder = new TextDecoder();
          message = decoder.decode(data);
        } else if (typeof data === 'string') {
          message = data;
        } else if (data.data) {
          message = new TextDecoder().decode(data.data);
        } else {
          message = String(data);
        }
        
        console.log('[WebRTC] Decoded message:', message);
        if (onData) onData(message);
      } catch (err) {
        console.error('[WebRTC] Error processing message:', err);
        if (onError) onError(new Error(`Message processing failed: ${err.message}`));
      }
    });

    // Error handling
    currentPeer.on('error', (err) => {
      console.error('[WebRTC] Peer error:', err);
      if (onError) onError(err);
      
      // Attempt to recover from certain errors
      if (err.message.includes('ICE failed') || 
          err.message.includes('connection failed')) {
        console.log('[WebRTC] Attempting to recover from connection error...');
        setTimeout(() => {
          if (currentPeer) {
            currentPeer.destroy();
            currentPeer = null;
          }
        }, 2000);
      }
    });

    // Connection closed
    currentPeer.on('close', () => {
      console.log('[WebRTC] Connection closed');
      if (currentPeer && currentPeer._pc) {
        console.log('[WebRTC] Final connection state:', currentPeer._pc.connectionState);
        console.log('[WebRTC] Final ICE state:', currentPeer._pc.iceConnectionState);
      }
      cleanup();
    });

    // Connection timeout
    const timeoutId = setTimeout(() => {
      if (currentPeer && currentPeer._pc && 
          currentPeer._pc.iceConnectionState !== 'connected' &&
          currentPeer._pc.iceConnectionState !== 'completed') {
        console.log('[WebRTC] Connection timeout - destroying peer');
        onError(new Error('Connection timeout'));
        cleanup();
      }
    }, 120000);

    // Store timeout ID for cleanup
    currentPeer._timeoutId = timeoutId;

    return currentPeer;
  } catch (err) {
    console.error('[WebRTC] Error creating peer:', err);
    if (onError) onError(err);
    throw err;
  }
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