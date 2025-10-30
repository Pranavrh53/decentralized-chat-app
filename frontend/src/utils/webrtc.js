import axios from 'axios';

const SIGNAL_SERVER = 'http://localhost:8000';

// Enhanced WebRTC configuration with multiple fallback options
const CONFIG = {
  iceServers: [
    // Primary TURN server (reliable)
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443?transport=tcp',
        'turns:openrelay.metered.ca:443'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
      credentialType: 'password'
    },
    // Fallback TURN server
    {
      urls: [
        'turn:numb.viagenie.ca:3478',
        'turn:numb.viagenie.ca:3478?transport=udp',
        'turn:numb.viagenie.ca:3478?transport=tcp'
      ],
      username: 'webrtc@live.com',
      credential: 'muazkh',
      credentialType: 'password'
    },
    // STUN servers
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.stunprotocol.org:3478' }
  ],
  // Connection settings
  iceTransportPolicy: 'all',
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  sdpSemantics: 'unified-plan'
};
// Enhanced debug logging
const debug = {
  log: (...args) => console.log('[WebRTC]', ...args),
  error: (...args) => console.error('[WebRTC]', ...args),
  warn: (...args) => console.warn('[WebRTC]', ...args)
};

// Patch the Peer class to handle browser differences
const PatchedPeer = class extends Peer {
  constructor(opts) {
    if (!window.RTCPeerConnection) {
      const error = 'WebRTC is not supported in this browser';
      debug.error(error);
      throw new Error(error);
    }

    const patchedOpts = {
      ...opts,
      wrtc: {
        RTCPeerConnection: window.RTCPeerConnection,
        RTCSessionDescription: window.RTCSessionDescription,
        RTCIceCandidate: window.RTCIceCandidate,
        RTCDataChannel: window.RTCDataChannel,
      },
      stream: false,
      initiator: opts.initiator,
      trickle: true, // Enable trickle ICE for faster connection
      config: CONFIG,
      reconnectTimer: 10000, // Increased reconnect timer
      sdpTransform: (sdp) => {
        debug.log('Original SDP:', sdp);
        // Add bandwidth restrictions and prefer VP8 codec
        sdp = sdp.replace(/a=mid:video\r\n/g, 'a=mid:video\r\nb=AS:512\r\n');
        sdp = sdp.replace(/a=rtpmap:(\d+) VP8\/90000/g, 'a=rtpmap:$1 VP8/90000\r\na=rtcp-fb:$1 goog-remb\r\na=rtcp-fb:$1 transport-cc\r\na=rtcp-fb:$1 ccm fir\r\na=rtcp-fb:$1 nack\r\na=rtcp-fb:$1 nack pli');
        debug.log('Transformed SDP:', sdp);
        return sdp;
      },
      objectMode: false,
      iceTransportPolicy: 'all',
      debug: 3,
      channels: []
    };

    try {
      super(patchedOpts);
      this._setupEventHandlers();
    } catch (err) {
      console.error('Failed to create peer connection:', err);
      throw err;
    }
  }

  _setupEventHandlers() {
    this.on('error', (err) => {
      console.error('Peer error:', err);
      this.emit('peerError', err);
    });

    this.on('connect', () => {
      console.log('Peer connected');
      this.emit('peerConnect');
    });

    this.on('close', () => {
      console.log('Peer connection closed');
      this.emit('peerClose');
    });
  }

  destroy() {
    try {
      super.destroy();
    } catch (err) {
      console.error('Error destroying peer:', err);
    }
  }
};

// Store active connections
const activeConnections = new Map();

// Polling interval for checking new signals
let pollingInterval = null;

// Send signal to the signaling server
const sendSignal = async (fromPeer, toPeer, signal) => {
  try {
    debug.log(`Sending ${signal.type} signal from ${fromPeer} to ${toPeer}`);
    
    let endpoint = '';
    if (signal.type === 'offer') {
      endpoint = '/offer';
    } else if (signal.type === 'answer') {
      endpoint = '/answer';
    } else if (signal.candidate) {
      endpoint = '/ice-candidate';
    } else {
      throw new Error('Unknown signal type');
    }

    const payload = endpoint === '/ice-candidate' 
      ? { from_peer: fromPeer, to_peer: toPeer, candidate: signal }
      : { from_peer: fromPeer, to_peer: toPeer, signal };

    await axios.post(`${SIGNAL_SERVER}${endpoint}`, payload, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    
    debug.log(`Signal ${signal.type || 'candidate'} sent successfully`);
  } catch (error) {
    debug.error('Failed to send signal:', error);
    throw error;
  }
};

// Poll for incoming signals
const startPolling = (peerId, peer, onSignal) => {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }

  pollingInterval = setInterval(async () => {
    try {
      const response = await axios.get(`${SIGNAL_SERVER}/check/${peerId}`, {
        timeout: 5000
      });

      const { type, signal, candidates } = response.data;
      
      if (type === 'offer' || type === 'answer') {
        debug.log(`Received ${type} signal`);
        peer.signal(signal);
      } else if (type === 'candidate' && candidates?.length) {
        debug.log(`Received ${candidates.length} ICE candidates`);
        candidates.forEach(candidate => {
  const connectionKey = `${localAddr}-${remoteAddr}`;
  
  // Reuse existing connection if available
  if (activeConnections.has(connectionKey)) {
    return activeConnections.get(connectionKey);
  }

  debug.log(`Creating ${initiator ? 'initiator' : 'responder'} peer connection`);
  
  try {
    // Create RTCPeerConnection
    const pc = new RTCPeerConnection(CONFIG);
    
    // Create a data channel for text messages
    let dataChannel;
    if (initiator) {
      dataChannel = pc.createDataChannel('chat', {
        ordered: true,
        maxRetransmits: 3
      });
      setupDataChannel(dataChannel);
    } else {
      pc.ondatachannel = (event) => {
        dataChannel = event.channel;
        setupDataChannel(dataChannel);
      };
    }

    // Set up data channel handlers
    function setupDataChannel(channel) {
      channel.onopen = () => {
        debug.log('Data channel opened');
        if (onConnect) onConnect();
      };
      
      channel.onmessage = (event) => {
        try {
          const data = event.data;
          if (typeof data === 'string' && !data.startsWith('Error:')) {
            if (onData) onData(data);
          }
        } catch (err) {
          debug.error('Error handling message:', err);
        }
      };
      
      channel.onclose = () => {
        debug.log('Data channel closed');
        if (onClose) onClose();
      };
      
      channel.onerror = (error) => {
        debug.error('Data channel error:', error);
        if (onError) onError(error);
      };
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        debug.log('New ICE candidate:', event.candidate.candidate);
        if (onSignal) {
          onSignal({
            type: 'candidate',
            candidate: event.candidate
          });
        }
      } else {
        debug.log('All ICE candidates gathered');
      }
    };

    // Handle connection state changes
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      debug.log('ICE connection state:', state);
      
      switch (state) {
        case 'connected':
          debug.log('✅ ICE connection established');
          break;
        case 'disconnected':
        case 'failed':
          debug.warn('ICE connection failed, attempting to restart...');
          pc.restartIce();
          break;
        case 'closed':
          debug.log('ICE connection closed');
          activeConnections.delete(connectionKey);
          if (onClose) onClose();
          break;
      }
    };
          debug.log('ICE gathering complete');
        }
      });
    }

    // Set up connection timeout with detailed debug info
    const connectionTimeout = setTimeout(() => {
      if (peer.connected || peer.destroyed) return;
      
      const debugInfo = getPeerDebugInfo(peer);
      debug.error('❌ Connection timeout after 90s', debugInfo);
      
      onMessage({ 
        type: 'error', 
        message: 'Connection timeout - check network and signaling',
        details: debugInfo
      });
      
      // Try to gather more diagnostic info before destroying
      if (peer._pc) {
        try {
          const stats = peer._pc.getStats();
          stats.then(report => {
            const statsOutput = [];
            report.forEach(s => statsOutput.push({
              type: s.type,
              id: s.id,
              ...Object.fromEntries(
                Object.entries(s).filter(([key]) => key !== 'type' && key !== 'id')
              )
            }));
            debug.error('PeerConnection stats before timeout:', statsOutput);
          }).catch(e => debug.error('Error getting stats:', e));
        } catch (e) {
          debug.error('Error getting peer stats:', e);
        }
      }
      
      peer.destroy();
    }, 90000);
    
    // Store timeout for cleanup
    connectionTimeouts.set(connectionKey, connectionTimeout);

    // Clean up on close
    peer.on('close', () => {
      debug.log('ℹ️ Peer connection closed');
      clearTimeout(connectionTimeouts.get(connectionKey));
      connectionTimeouts.delete(connectionKey);
      activeConnections.delete(remoteAddr);
      
      // Remove event listeners
      if (peer._pc) {
        peer._pc.removeEventListener('iceconnectionstatechange', handleIceStateChange);
        peer._pc.removeEventListener('connectionstatechange', handleConnectionStateChange);
        peer._pc.removeEventListener('icegatheringstatechange', handleIceGatheringStateChange);
      }
    });

    // Enhanced error handling
    peer.on('error', (err) => {
      debug.error('❌ Peer connection error:', {
        name: err.name,
        message: err.message,
        stack: err.stack,
        peerState: peer._pc ? getPeerDebugInfo(peer) : 'no peer connection'
      });
      
      clearTimeout(connectionTimeouts.get(connectionKey));
      
      onMessage({ 
        type: 'error', 
        message: `Peer error: ${err.message || 'Unknown error'}`,
        details: {
          name: err.name,
          code: err.code,
          peerState: peer._pc ? getPeerDebugInfo(peer) : 'no peer connection'
        }
      });
    });

    // Store the connection
    activeConnections.set(connectionKey, peer);
    
    // Start polling for signals
    startPolling(localAddr, peer);
    
    // Enhanced signal handling with retry logic
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000; // 1 second
    
    peer.on('signal', async (data, retryCount = 0) => {
      const signalType = data.type || (data.candidate ? 'candidate' : 'signal');
      debug.log(`📤 Sending ${signalType} signal to ${remoteAddr}`);
      
      // Log detailed ICE candidate info
      if (data.candidate) {
        const candidate = data.candidate.candidate || data.candidate;
        const candidateType = candidate.split(' ')[7]; // Get candidate type (host/srflx/relay)
        debug.log('📝 ICE candidate details:', {
          type: candidateType,
          protocol: data.candidate.protocol,
          ip: data.candidate.ip || data.candidate.address,
          port: data.candidate.port,
          sdpMid: data.candidate.sdpMid,
          sdpMLineIndex: data.candidate.sdpMLineIndex,
          candidate: candidate
        });
      }
      
      try {
        await sendSignal(localAddr, remoteAddr, data);
        debug.log(`✅ Successfully sent ${signalType} signal`);
      } catch (err) {
        if (retryCount < MAX_RETRIES) {
          debug.warn(`⚠️ Failed to send ${signalType}, retrying (${retryCount + 1}/${MAX_RETRIES})...`);
          setTimeout(() => peer.signal(data, retryCount + 1), RETRY_DELAY * (retryCount + 1));
        } else {
          debug.error(`❌ Failed to send ${signalType} after ${MAX_RETRIES} attempts:`, err);
          onMessage({ 
            type: 'error', 
            message: `Failed to send ${signalType} signal`,
            details: err.message
          });
        }
      }
    });

    peer.on('data', (data) => {
      try {
        onMessage(data.toString());
      } catch (err) {
        debug.error('Error handling message:', err);
      }
    });

    peer.on('connect', () => {
      debug.log('Peer connection established');
      stopPolling();
    });

    peer.on('close', () => {
      debug.log('Peer connection closed, cleaning up');
      stopPolling();
      activeConnections.delete(connectionKey);
    });

    peer.on('error', (err) => {
      debug.error('Peer connection error:', err);
      stopPolling();
      activeConnections.delete(connectionKey);
    });

    // Set connection timeout (using connectionTimeoutId to avoid naming conflict)
    const connectionTimeoutId = setTimeout(() => {
      if (peer.connected) return;
      
      const debugInfo = {
        connectionState: peer._pc ? peer._pc.connectionState : 'no peer connection',
        iceGatheringState: peer._pc ? peer._pc.iceGatheringState : 'no peer connection',
        iceConnectionState: peer._pc ? peer._pc.iceConnectionState : 'no peer connection',
        signalingState: peer._pc ? peer._pc.signalingState : 'no peer connection',
        localDescription: peer._pc?.localDescription?.type || 'no local description',
        remoteDescription: peer._pc?.remoteDescription?.type || 'no remote description'
      };
      
      debug.error('WebRTC connection timeout after 60 seconds', debugInfo);
      
      // Emit error event before destroying
      peer.emit('error', new Error('Connection timeout'));
      peer.destroy();
      
      // Don't throw here, let the error handler handle it
      peer.emit('timeout', debugInfo);
    }, 60000);

    // Clean up on successful connection
    peer.on('connect', () => {
      clearTimeout(connectionTimeoutId);
    });

    return peer;
  } catch (err) {
    debug.error('Error in createPeerConnection:', err);
    stopPolling();
    activeConnections.delete(connectionKey);
    throw err;
  }
};

export const closeAllConnections = () => {
  debug.log('Closing all peer connections');
  stopPolling();
  
  activeConnections.forEach((peer, key) => {
    try {
      peer.destroy();
    } catch (err) {
      debug.error('Error closing peer connection:', err);
    }
    activeConnections.delete(key);
  });
};
