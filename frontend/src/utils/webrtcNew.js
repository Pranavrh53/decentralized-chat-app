import axios from 'axios';

const SIGNAL_SERVER = 'http://localhost:8000';

// WebRTC configuration with multiple TURN/STUN servers
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
    { urls: 'stun:stun2.l.google.com:19302' }
  ],
  iceTransportPolicy: 'all',
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  sdpSemantics: 'unified-plan'
};

// Debug logging utility
const debug = {
  log: (...args) => console.log('[WebRTC]', ...args),
  error: (...args) => console.error('[WebRTC]', ...args),
  warn: (...args) => console.warn('[WebRTC]', ...args)
};

// Track active connections
const activeConnections = new Map();

// Create a new WebRTC connection using native APIs
const createPeerConnection = ({
  localAddr,
  remoteAddr,
  initiator = false,
  onSignal,
  onConnect,
  onData,
  onClose,
  onError
}) => {
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
          if (pc.restartIce) {
            pc.restartIce();
          } else {
            // Fallback for browsers that don't support restartIce
            pc.close();
            activeConnections.delete(connectionKey);
            // Attempt to reconnect
            setTimeout(() => {
              createPeerConnection({
                localAddr,
                remoteAddr,
                initiator,
                onSignal,
                onConnect,
                onData,
                onClose,
                onError
              });
            }, 2000);
          }
          break;
        case 'closed':
          debug.log('ICE connection closed');
          activeConnections.delete(connectionKey);
          if (onClose) onClose();
          break;
      }
    };

    // Handle signaling state changes
    pc.onsignalingstatechange = () => {
      debug.log('Signaling state:', pc.signalingState);
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      debug.log('Connection state:', pc.connectionState);
    };

    // Create and set local description
    async function createOffer() {
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: false,
          offerToReceiveVideo: false
        });
        
        // Add bandwidth settings to the SDP
        const sdp = setBandwidth(offer.sdp);
        await pc.setLocalDescription({ ...offer, sdp });
        
        if (onSignal) {
          onSignal({
            type: 'offer',
            sdp: pc.localDescription.sdp
          });
        }
      } catch (err) {
        debug.error('Error creating offer:', err);
        if (onError) onError(err);
      }
    }

    // Set bandwidth in SDP
    function setBandwidth(sdp) {
      // Add bandwidth settings
      sdp = sdp.replace(/a=mid:video\r\n/g, 'a=mid:video\r\nb=AS:512\r\n');
      
      // Add RTCP feedback
      sdp = sdp.replace(/a=rtpmap:(\d+) VP8\/90000/g, 
        'a=rtpmap:$1 VP8/90000\r\n' +
        'a=rtcp-fb:$1 goog-remb\r\n' +
        'a=rtcp-fb:$1 transport-cc\r\n' +
        'a=rtcp-fb:$1 ccm fir\r\n' +
        'a=rtcp-fb:$1 nack\r\n' +
        'a=rtcp-fb:$1 nack pli');
      
      return sdp;
    }

    // Handle incoming remote description
    async function handleRemoteDescription(description) {
      try {
        // Add bandwidth settings to the SDP before setting remote description
        if (description.sdp) {
          description.sdp = setBandwidth(description.sdp);
        }
        
        await pc.setRemoteDescription(description);
        
        if (description.type === 'offer') {
          const answer = await pc.createAnswer();
          // Add bandwidth settings to the answer
          answer.sdp = setBandwidth(answer.sdp);
          await pc.setLocalDescription(answer);
          
          if (onSignal) {
            onSignal({
              type: 'answer',
              sdp: answer.sdp
            });
          }
        }
      } catch (err) {
        debug.error('Error handling remote description:', err);
        if (onError) onError(err);
      }
    }

    // Handle incoming ICE candidate
    async function addIceCandidate(candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        // Ignore errors about duplicate candidates
        if (!err.message.includes('already exists')) {
          debug.error('Error adding ICE candidate:', err);
        }
      }
    }

    // Store the connection
    const connection = {
      pc,
      dataChannel,
      send: (data) => {
        if (dataChannel && dataChannel.readyState === 'open') {
          dataChannel.send(data);
          return true;
        }
        debug.warn('Cannot send data: Data channel not open');
        return false;
      },
      close: () => {
        if (pc.connectionState !== 'closed') {
          debug.log('Closing peer connection');
          pc.close();
          activeConnections.delete(connectionKey);
        }
      },
      handleSignal: async (signal) => {
        try {
          if (signal.type === 'offer' || signal.type === 'answer') {
            await handleRemoteDescription({
              type: signal.type,
              sdp: signal.sdp
            });
          } else if (signal.type === 'candidate' && signal.candidate) {
            await addIceCandidate(signal.candidate);
          }
        } catch (err) {
          debug.error('Error handling signal:', err);
          if (onError) onError(err);
        }
      }
    };

    activeConnections.set(connectionKey, connection);

    // Start the connection process if we're the initiator
    if (initiator) {
      createOffer();
    }

    return connection;
  } catch (error) {
    debug.error('Error creating peer connection:', error);
    if (onError) onError(error);
    throw error;
  }
};

// Close all active connections
const closeAllConnections = () => {
  debug.log('Closing all peer connections');
  activeConnections.forEach(connection => {
    if (connection.pc) {
      connection.pc.close();
    }
  });
  activeConnections.clear();
};

export { createPeerConnection, closeAllConnections };
