import React, { useState, useEffect, useRef, useCallback } from 'react';
import Navbar from '../components/Navbar';
import { initWeb3, getWeb3 } from '../utils/blockchain';
import ChatMetadataABI from '../abis/ChatMetadata.json';
import {
  createPeer,
  setupSignaling,
  setGlobalCallbacks,
  cleanup,
  cleanupPeerOnly,
  getUserMedia,
  stopUserMedia,
  setAudioMuted,
  setVideoEnabled,
  setCurrentCallType
} from '../utils/webrtc';
import {
  Box,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Typography,
  Button,
  IconButton,
  Divider,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  Videocam,
  Call,
  CallEnd,
  Mic,
  MicOff,
  Videocam as VideocamOn,
  VideocamOff,
  AccountCircle
} from '@mui/icons-material';

// Cache buster
console.log('[Calls.js] 🔥 LOADED - Version 13.0 - TRICKLE-FALSE + NO-STREAM-KILL 🔥');

const Calls = ({ walletAddress, onLogout }) => {
  const username = localStorage.getItem('username') || 'Anonymous';
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [contract, setContract] = useState(null);

  // Call state
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [connected, setConnected] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [callType, setCallType] = useState(null); // 'video' or 'audio'
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [isInitiator, setIsInitiator] = useState(false);

  // Refs
  const peerRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null); // Dedicated audio element for audio calls
  const handleIncomingMessageRef = useRef(null);
  const friendsRef = useRef([]);
  const pendingCallTypeRef = useRef(null);
  const selectedFriendRef = useRef(null);
  const incomingCallRef = useRef(null);
  const callTypeRef = useRef(null); // Track call type for onStream callback
  // Store the pending offer so we can signal it AFTER we create the peer with stream
  const pendingOfferRef = useRef(null);

  // Keep refs in sync with state
  useEffect(() => {
    selectedFriendRef.current = selectedFriend;
  }, [selectedFriend]);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  // Initialize contract
  useEffect(() => {
    const setupContract = async () => {
      try {
        await initWeb3();
        const web3 = getWeb3();
        const CONTRACT_ADDRESS = process.env.REACT_APP_CONTRACT_ADDRESS;

        if (CONTRACT_ADDRESS) {
          const contractInstance = new web3.eth.Contract(
            ChatMetadataABI.abi,
            CONTRACT_ADDRESS
          );
          setContract(contractInstance);
        }
      } catch (error) {
        console.error('Error setting up contract:', error);
      }
    };

    if (walletAddress) {
      setupContract();
    }
  }, [walletAddress]);

  // Load friends
  useEffect(() => {
    if (walletAddress && contract) {
      loadFriends();
    }
  }, [walletAddress, contract]);

  const loadFriends = async () => {
    if (!walletAddress) return;

    setLoading(true);
    try {
      let blockchainFriends = [];

      if (contract) {
        try {
          const friendAddresses = await contract.methods.getFriends(walletAddress).call();
          const friendsData = await Promise.all(
            friendAddresses.map(async (friendAddress) => {
              const friendData = await contract.methods.getFriend(walletAddress, friendAddress).call();
              return {
                address: friendData.friendAddress.toLowerCase(),
                name: friendData.name,
                exists: friendData.exists,
                source: 'blockchain'
              };
            })
          );
          blockchainFriends = friendsData.filter(f => f.exists);
        } catch (err) {
          console.error('Error loading from blockchain:', err);
        }
      }

      const normalizedAddress = walletAddress.toLowerCase();
      let localFriends = JSON.parse(localStorage.getItem(`friends_${normalizedAddress}`) || '[]');
      if (localFriends.length === 0) {
        localFriends = JSON.parse(localStorage.getItem(`friends_${walletAddress}`) || '[]');
      }

      const mergedFriendsMap = new Map();
      blockchainFriends.forEach(friend => {
        mergedFriendsMap.set(friend.address, friend);
      });
      localFriends.forEach(friend => {
        if (!mergedFriendsMap.has(friend.address.toLowerCase())) {
          mergedFriendsMap.set(friend.address.toLowerCase(), { ...friend, source: 'local' });
        }
      });

      const mergedFriends = Array.from(mergedFriendsMap.values());
      setFriends(mergedFriends);
      friendsRef.current = mergedFriends;
    } catch (err) {
      console.error('Error loading friends:', err);
      setError('Failed to load friends');
    } finally {
      setLoading(false);
    }
  };

  // Handle remote stream — attaches the remote MediaStream to the appropriate element
  const onStream = useCallback((stream) => {
    console.log('[Calls] 📹 Received remote stream');
    console.log('[Calls] Stream ID:', stream.id);
    console.log('[Calls] Stream tracks:', stream.getTracks().map(t => `${t.kind}: ${t.label} (enabled: ${t.enabled}, readyState: ${t.readyState})`));
    console.log('[Calls] Current callTypeRef:', callTypeRef.current);

    const hasVideoTrack = stream.getVideoTracks().length > 0;
    const hasAudioTrack = stream.getAudioTracks().length > 0;
    const isAudioOnly = callTypeRef.current === 'audio';

    console.log('[Calls] hasVideoTrack:', hasVideoTrack, 'hasAudioTrack:', hasAudioTrack, 'isAudioOnly:', isAudioOnly);

    // ALWAYS attach to the audio element first — this ensures audio works
    // regardless of whether the video element is rendered
    if (remoteAudioRef.current) {
      console.log('[Calls] ✅ Setting remote audio srcObject');
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.srcObject = stream;
      remoteAudioRef.current.play().then(() => {
        console.log('[Calls] ✅ Remote audio started playing');
      }).catch(err => {
        console.warn('[Calls] Audio autoplay blocked:', err.message);
      });
    } else {
      console.error('[Calls] ❌ remoteAudioRef.current is null!');
    }

    // For video calls, also attach to the video element
    if (!isAudioOnly && hasVideoTrack) {
      const attachToVideo = () => {
        if (remoteVideoRef.current) {
          console.log('[Calls] Setting remote video srcObject');
          remoteVideoRef.current.srcObject = null;
          remoteVideoRef.current.srcObject = stream;
          remoteVideoRef.current.play().then(() => {
            console.log('[Calls] ✅ Remote video started playing');
          }).catch(err => {
            console.warn('[Calls] Video autoplay blocked:', err.message);
          });
        } else {
          console.warn('[Calls] remoteVideoRef not ready, retrying...');
          setTimeout(attachToVideo, 500);
        }
      };
      attachToVideo();
    }
  }, []);

  // Handle incoming data channel messages
  const handleIncomingMessage = useCallback(async (data) => {
    console.log('[Calls] 📨 Raw incoming data:', data);

    try {
      let messageData;
      if (typeof data === 'string') {
        try {
          messageData = JSON.parse(data);
          console.log('[Calls] 📦 Parsed message:', messageData.type);
        } catch (e) {
          console.log('[Calls] ⚠️ Not JSON, ignoring');
          return;
        }
      } else {
        console.log('[Calls] ⚠️ Data is not string, ignoring');
        return;
      }

      // Handle call signaling messages sent over the data channel
      if (messageData.type === 'call-request') {
        console.log('[Calls] 📞 Received call-request:', messageData.callType, 'from:', messageData.from);

        const callingFriend = friendsRef.current.find(f =>
          f.address.toLowerCase() === messageData.from.toLowerCase()
        );

        if (callingFriend) {
          console.log('[Calls] ✅ Found friend:', callingFriend.name);

          // Update refs BEFORE state to prevent cleanup from destroying peer
          selectedFriendRef.current = callingFriend;
          const incomingCallData = {
            from: messageData.from,
            callType: messageData.callType
          };
          incomingCallRef.current = incomingCallData;

          // Update state
          setSelectedFriend(callingFriend);
          setIsInitiator(false);
          setIncomingCall(incomingCallData);
        } else {
          console.warn('[Calls] ⚠️ Friend not found for address:', messageData.from);
        }
        return;
      }

      if (messageData.type === 'call-accepted') {
        console.log('[Calls] ✅ Call accepted by peer');
        return;
      }

      if (messageData.type === 'call-rejected') {
        console.log('[Calls] ❌ Call rejected by peer');
        setError('Call was rejected');
        handleEndCall();
        return;
      }

      if (messageData.type === 'call-ended') {
        console.log('[Calls] 👋 Call ended by peer');
        handleEndCall();
        return;
      }
    } catch (err) {
      console.error('[Calls] ❌ Error processing message:', err);
    }
  }, []);

  useEffect(() => {
    handleIncomingMessageRef.current = handleIncomingMessage;
  }, [handleIncomingMessage]);

  // ─────────────────────────────────────────────────────────────────
  // GLOBAL LISTENER: Listens for incoming WebRTC offers when NO friend is selected.
  // When an offer arrives, we DON'T create the peer immediately.
  // Instead we store the offer and wait for the user to accept the call,
  // at which point we get media, create the peer WITH stream, and THEN signal the offer.
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedFriend && walletAddress) {
      console.log('[Calls] 🎧 Setting up global incoming call listener for:', walletAddress);

      const handleGlobalSignal = (signal) => {
        console.log('[Calls] 📡 Global signal received:', signal.type || 'candidate');

        if (signal.type === 'offer') {
          const fromAddress = signal.from;
          const offerCallType = signal.callType || 'video'; // Default to video if missing
          console.log('[Calls] 📞 Received offer from:', fromAddress, 'type:', offerCallType);

          if (fromAddress) {
            const callingFriend = friendsRef.current.find(f =>
              f.address.toLowerCase() === fromAddress.toLowerCase()
            );

            if (callingFriend) {
              console.log('[Calls] ✅ Found calling friend:', callingFriend.name);

              // Store the offer — we'll signal it to the peer AFTER we create it with a stream
              pendingOfferRef.current = signal;

              // Update refs first
              selectedFriendRef.current = callingFriend;
              const incomingCallData = {
                from: fromAddress,
                callType: offerCallType
              };
              incomingCallRef.current = incomingCallData;

              // Set state to show incoming call UI
              setSelectedFriend(callingFriend);
              setIsInitiator(false);
              setIncomingCall(incomingCallData);
            } else {
              console.warn('[Calls] ⚠️ Offer from unknown address:', fromAddress);
            }
          }
          return;
        }

        // ICE candidates and answers for an active peer
        if (peerRef.current && !peerRef.current.destroyed) {
          try {
            peerRef.current.signal(signal);
          } catch (err) {
            console.error('[Calls] Error forwarding signal to peer:', err);
          }
        } else {
          // Store candidates that arrive before peer creation
          console.log('[Calls] ⚠️ No peer yet for signal:', signal.type || 'candidate');
        }
      };

      setupSignaling(walletAddress, handleGlobalSignal, '');

      return () => {
        const currentSelectedFriend = selectedFriendRef.current;
        const currentIncomingCall = incomingCallRef.current;

        if (currentSelectedFriend || currentIncomingCall) {
          console.log('[Calls] ✅ Active call state, preserving connection');
          return;
        }

        console.log('[Calls] 🧹 Global listener cleanup - no active call');
        cleanup(true);
      };
    }
  }, [walletAddress]);

  // ─────────────────────────────────────────────────────────────────
  // RESPONDER SIGNALING: When we are the responder and have a selected friend,
  // handle incoming signals (answers/candidates). The peer creation itself
  // happens in handleAcceptCall (with stream).
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (selectedFriend && !isInitiator && walletAddress) {
      console.log('[Calls] 🔁 Responder signaling setup for:', selectedFriend.name);

      const handleSignal = (signal) => {
        // As responder, we ignore duplicate offers (we already have the pending one)
        if (signal.type === 'offer') {
          console.log('[Calls] Responder received offer (storing/updating)');
          pendingOfferRef.current = signal;
          return;
        }

        // Forward answers and candidates to existing peer
        if (peerRef.current && !peerRef.current.destroyed && peerRef.current._pc) {
          try {
            console.log('[Calls] ➡️ Forwarding signal to responder peer:', signal.type || 'candidate');
            peerRef.current.signal(signal);
          } catch (err) {
            console.error('[Calls] Error signaling responder peer:', err);
          }
        } else {
          console.log('[Calls] ⚠️ No responder peer yet for signal:', signal.type || 'candidate');
        }
      };

      setupSignaling(walletAddress, handleSignal, selectedFriend.address);

      return () => {
        if (!inCall && !incomingCallRef.current) {
          cleanup(false);
        }
      };
    }
  }, [selectedFriend, isInitiator, walletAddress, inCall]);

  // ─────────────────────────────────────────────────────────────────
  // INITIATOR: Start connection — get media FIRST, create peer WITH stream
  // ─────────────────────────────────────────────────────────────────
  const startConnection = async (friend, type) => {
    console.log('[Calls] 🎬 Starting connection as initiator with:', friend.name, 'type:', type);

    selectedFriendRef.current = friend;
    callTypeRef.current = type; // Track call type before stream arrives
    setCurrentCallType(type); // Set in webrtc module for signaling
    setSelectedFriend(friend);
    setIsInitiator(true);
    setCallType(type);
    setInCall(true); // Set inCall early so UI elements are rendered
    setError(null);
    setConnected(false);

    try {
      // STEP 1: Get local media BEFORE creating peer
      const video = type === 'video';
      console.log('[Calls] 🎤 Getting user media (video:', video, ')');
      setLoading(true);
      const stream = await getUserMedia(video, true);
      console.log('[Calls] ✅ Got local media stream');
      console.log('[Calls] Stream tracks:', stream.getTracks().map(t => `${t.kind}: ${t.label} (enabled: ${t.enabled})`));

      // STEP 2: Attach local stream to local video element (only for video calls)
      if (type === 'video' && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        try { await localVideoRef.current.play(); } catch (e) { /* autoplay handles it */ }
        console.log('[Calls] ✅ Local video attached');
      }

      // STEP 3: Clean up old peer WITHOUT killing the stream we just acquired
      cleanupPeerOnly();

      const onData = (data) => {
        if (handleIncomingMessageRef.current) {
          handleIncomingMessageRef.current(data);
        }
      };

      const onConnect = () => {
        console.log('[Calls] ✅ Initiator data channel connected!');
        setConnected(true);
        setLoading(false);

        // Data channel is ready — send the call request
        const pt = pendingCallTypeRef.current;
        if (pt) {
          console.log('[Calls] 📡 Sending call request:', pt);
          setTimeout(() => {
            sendCallRequest(pt);
            pendingCallTypeRef.current = null;
          }, 500);
        }
      };

      const onError = (err) => {
        console.error('[Calls] Initiator error:', err);
        if (err.message !== 'Timeout' && err.message !== 'Connection failed') {
          setError(err.message);
        }
        setConnected(false);
      };

      const handleSignal = (signal) => {
        if (signal.type === 'offer') return; // We sent the offer, ignore our own

        if (!peerRef.current || peerRef.current.destroyed) {
          console.warn('[Calls] ⚠️ No peer to signal to');
          return;
        }

        try {
          console.log('[Calls] ✅ Signaling', signal.type || 'candidate', 'to initiator peer');
          peerRef.current.signal(signal);
        } catch (err) {
          console.error('[Calls] Error signaling peer:', err);
        }
      };

      // STEP 4: Setup signaling and create peer WITH stream — NO delay
      console.log('[Calls] Creating initiator peer WITH local stream...');
      setupSignaling(walletAddress, handleSignal, friend.address);
      peerRef.current = createPeer(
        true,             // initiator
        walletAddress,
        friend.address,
        onData,
        onConnect,
        onError,
        stream,           // ✅ Stream is in the initial SDP
        onStream          // callback for remote stream
      );

    } catch (err) {
      console.error('[Calls] ❌ Failed to get media:', err);
      setError(`Failed to access camera/microphone: ${err.message}`);
      setLoading(false);
      setInCall(false);
      setCallType(null);
      callTypeRef.current = null;
    }
  };

  // Send call-request message over the data channel
  const sendCallRequest = (type) => {
    if (!peerRef.current || peerRef.current.destroyed) {
      console.error('[Calls] ❌ Cannot send call request - no peer');
      return;
    }

    const dataChannel = peerRef.current._channel;
    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.warn('[Calls] ⚠️ Data channel not open, retrying...');
      setTimeout(() => sendCallRequest(type), 1000);
      return;
    }

    try {
      const callRequest = {
        type: 'call-request',
        callType: type,
        from: walletAddress
      };
      peerRef.current.send(JSON.stringify(callRequest));
      console.log('[Calls] ✅ Call request sent:', type);

      setLoading(false);
    } catch (err) {
      console.error('[Calls] ❌ Error sending call request:', err);
      setError('Failed to send call request');
    }
  };

  // ─────────────────────────────────────────────────────────────────
  // Handle clicking "Video Call" or "Audio Call" on a friend
  // ─────────────────────────────────────────────────────────────────
  const handleStartCall = async (friend, type) => {
    console.log('[Calls] 📞 handleStartCall:', friend.name, type);
    pendingCallTypeRef.current = type;
    startConnection(friend, type);
  };

  // ─────────────────────────────────────────────────────────────────
  // ACCEPT CALL: The responder gets media, creates peer WITH stream,
  // then signals the stored offer to the peer. This ensures both sides
  // have media tracks in the initial SDP exchange.
  // ─────────────────────────────────────────────────────────────────
  const handleAcceptCall = async () => {
    if (!incomingCall) return;

    console.log('[Calls] 📞 Accepting call — STREAM-FIRST architecture');
    const callTypeToAccept = incomingCall.callType;
    const storedOffer = pendingOfferRef.current;

    if (!storedOffer) {
      console.error('[Calls] ❌ No stored offer to accept!');
      setError('Call data lost. Please ask the caller to try again.');
      return;
    }

    try {
      setLoading(true);

      // Set call type BEFORE getting media so onStream knows the type
      callTypeRef.current = callTypeToAccept;
      setCurrentCallType(callTypeToAccept); // Set in webrtc module for signaling
      setCallType(callTypeToAccept);
      setInCall(true); // Set inCall early so UI elements are rendered

      // STEP 1: Get local media FIRST
      const video = callTypeToAccept === 'video';
      console.log('[Calls] 🎤 Getting user media BEFORE creating peer (video:', video, ')');
      const stream = await getUserMedia(video, true);
      console.log('[Calls] ✅ Got media stream');
      console.log('[Calls] Stream tracks:', stream.getTracks().map(t => `${t.kind}: ${t.label} (enabled: ${t.enabled})`));

      // STEP 2: Attach to local video element (only for video calls)
      if (callTypeToAccept === 'video' && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        try { await localVideoRef.current.play(); } catch (e) { /* autoplay */ }
        console.log('[Calls] ✅ Local video attached');
      }

      // STEP 3: Destroy any old peer (clean slate)
      if (peerRef.current && !peerRef.current.destroyed) {
        console.log('[Calls] Destroying old peer before creating new one with stream');
        peerRef.current.destroy();
        peerRef.current = null;
      }

      const onData = (data) => {
        if (handleIncomingMessageRef.current) {
          handleIncomingMessageRef.current(data);
        }
      };

      const onConnect = () => {
        console.log('[Calls] ✅ Responder data channel connected!');
        setConnected(true);

        // Send call-accepted over data channel
        try {
          if (peerRef.current && !peerRef.current.destroyed) {
            const dataChannel = peerRef.current._channel;
            if (dataChannel && dataChannel.readyState === 'open') {
              peerRef.current.send(JSON.stringify({
                type: 'call-accepted',
                callType: callTypeToAccept
              }));
              console.log('[Calls] ✅ Sent call-accepted via data channel');
            }
          }
        } catch (err) {
          console.warn('[Calls] Error sending call-accepted:', err);
        }
      };

      const onError = (err) => {
        console.error('[Calls] Responder error:', err);
        if (err.message !== 'Timeout' && err.message !== 'Connection failed') {
          setError(err.message);
        }
        setConnected(false);
      };

      // STEP 4: Create responder peer WITH stream
      console.log('[Calls] 🔗 Creating responder peer WITH local stream');
      peerRef.current = createPeer(
        false,              // NOT initiator (responder)
        walletAddress,
        selectedFriend.address,
        onData,
        onConnect,
        onError,
        stream,             // ✅ Stream included in SDP answer
        onStream            // callback for remote stream
      );

      // STEP 5: NOW signal the stored offer to the peer
      console.log('[Calls] 📡 Signaling stored offer to responder peer');
      try {
        peerRef.current.signal(storedOffer);
        console.log('[Calls] ✅ Offer signaled to peer');
      } catch (err) {
        console.error('[Calls] ❌ Error signaling stored offer:', err);
        setError('Failed to process call. Please try again.');
        setLoading(false);
        return;
      }

      // Clear the pending offer
      pendingOfferRef.current = null;

      incomingCallRef.current = null;
      setIncomingCall(null);
      setLoading(false);
      console.log('[Calls] 🎉 Call accepted successfully with stream-first architecture!');

    } catch (error) {
      console.error('[Calls] Error accepting call:', error);
      setError(`Failed to accept call: ${error.message}`);
      setLoading(false);
      setInCall(false);
      setCallType(null);
      callTypeRef.current = null;
    }
  };

  const handleRejectCall = () => {
    if (!incomingCall) return;

    if (peerRef.current && !peerRef.current.destroyed) {
      try {
        const dataChannel = peerRef.current._channel;
        if (dataChannel && dataChannel.readyState === 'open') {
          peerRef.current.send(JSON.stringify({ type: 'call-rejected' }));
        }
      } catch (err) {
        console.warn('[Calls] Error sending call-rejected:', err);
      }
    }

    pendingOfferRef.current = null;
    incomingCallRef.current = null;
    setIncomingCall(null);
  };

  const handleEndCall = () => {
    stopUserMedia();

    if (peerRef.current && !peerRef.current.destroyed) {
      try {
        const dataChannel = peerRef.current._channel;
        if (dataChannel && dataChannel.readyState === 'open') {
          peerRef.current.send(JSON.stringify({ type: 'call-ended' }));
        }
      } catch (err) {
        console.warn('[Calls] Error sending call-ended:', err);
      }
    }

    setInCall(false);
    setCallType(null);
    callTypeRef.current = null;
    setIsMuted(false);
    setIsVideoOff(false);
    pendingCallTypeRef.current = null;
    pendingOfferRef.current = null;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  };

  const handleToggleMute = () => {
    const newMuted = !isMuted;
    setAudioMuted(newMuted);
    setIsMuted(newMuted);
  };

  const handleToggleVideo = () => {
    const newVideoOff = !isVideoOff;
    setVideoEnabled(!newVideoOff);
    setIsVideoOff(newVideoOff);
  };

  const handleBackToList = () => {
    handleEndCall();

    selectedFriendRef.current = null;
    incomingCallRef.current = null;
    pendingOfferRef.current = null;

    setSelectedFriend(null);
    setConnected(false);
    pendingCallTypeRef.current = null;
    cleanup(true);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup(true);
    };
  }, []);

  const getAvatarEmoji = (name) => {
    if (!name) return '👤';
    const emojis = ['👨', '👩', '🧑', '👨‍💼', '👩‍💼', '👨‍🎓', '👩‍🎓', '👨‍💻', '👩‍💻'];
    const index = name.charCodeAt(0) % emojis.length;
    return emojis[index];
  };

  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f1419 0%, #1a1f3a 50%, #2d1b4e 100%)',
    },
    contentWrapper: {
      padding: '40px',
      maxWidth: '1400px',
      margin: '0 auto',
    },
    header: {
      marginBottom: '30px',
      textAlign: 'center'
    },
    title: {
      fontSize: '32px',
      fontWeight: 700,
      background: 'linear-gradient(135deg, #ff8c42 0%, #8a66ff 100%)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      marginBottom: '10px'
    },
    subtitle: {
      color: 'rgba(255, 255, 255, 0.7)',
      fontSize: '16px'
    }
  };

  if (selectedFriend) {
    return (
      <div style={styles.container}>
        <Navbar username={username} walletAddress={walletAddress} onLogout={onLogout} />

        <Box sx={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
          {/* Header */}
          <Paper sx={{
            background: 'linear-gradient(135deg, rgba(138, 102, 255, 0.1) 0%, rgba(255, 140, 66, 0.1) 100%)',
            border: '1px solid rgba(138, 102, 255, 0.3)',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Avatar sx={{
                width: 60,
                height: 60,
                background: 'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)',
                fontSize: '28px'
              }}>
                {getAvatarEmoji(selectedFriend.name)}
              </Avatar>
              <Box>
                <Typography sx={{ color: '#fff', fontSize: '24px', fontWeight: 600 }}>
                  {selectedFriend.name}
                </Typography>
                <Typography sx={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '14px' }}>
                  {selectedFriend.address.substring(0, 8)}...{selectedFriend.address.slice(-6)}
                </Typography>
                {(inCall || incomingCall || loading) && (
                  <Typography sx={{
                    color: connected ? '#10b981' : '#ef4444',
                    fontSize: '14px',
                    fontWeight: 600,
                    mt: 0.5
                  }}>
                    {connected ? '🟢 Connected' : '🔴 Connecting...'}
                  </Typography>
                )}
              </Box>
            </Box>
            <Button
              variant="outlined"
              onClick={handleBackToList}
              sx={{
                borderColor: 'rgba(239, 68, 68, 0.5)',
                color: '#ef4444',
                '&:hover': {
                  borderColor: '#ef4444',
                  background: 'rgba(239, 68, 68, 0.1)'
                }
              }}
            >
              ← Back to Friends
            </Button>
          </Paper>

          {/* Error Banner */}
          {error && (
            <Alert severity="error" sx={{ marginBottom: '20px' }}>
              {error}
            </Alert>
          )}

          {/* Incoming Call Notification */}
          {incomingCall && (
            <Paper sx={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              padding: '20px',
              borderRadius: '12px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <Typography sx={{ color: '#fff', fontSize: '18px', fontWeight: 600 }}>
                📞 Incoming {incomingCall.callType} call...
              </Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button
                  variant="contained"
                  onClick={handleAcceptCall}
                  disabled={loading}
                  sx={{
                    background: '#fff',
                    color: '#10b981',
                    '&:hover': { background: '#f0f0f0' }
                  }}
                >
                  {loading ? 'Connecting...' : 'Accept'}
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleRejectCall}
                  sx={{
                    borderColor: '#fff',
                    color: '#fff',
                    '&:hover': { borderColor: '#fff', background: 'rgba(255, 255, 255, 0.1)' }
                  }}
                >
                  Decline
                </Button>
              </Box>
            </Paper>
          )}

          {/* Hidden audio element — ALWAYS rendered so audio streams work */}
          <audio
            ref={remoteAudioRef}
            autoPlay
            playsInline
            style={{ display: 'none' }}
          />

          {/* Call Interface */}
          {inCall && (
            <Paper sx={{
              background: callType === 'audio'
                ? 'linear-gradient(135deg, #1a1f3a 0%, #2d1b4e 50%, #1a1f3a 100%)'
                : '#000',
              borderRadius: '16px',
              padding: '20px',
              position: 'relative',
              minHeight: callType === 'audio' ? '350px' : '500px'
            }}>
              {/* Remote Video (only for video calls) */}
              {callType === 'video' && (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  style={{
                    width: '100%',
                    height: '500px',
                    borderRadius: '12px',
                    background: '#000',
                    objectFit: 'cover',
                  }}
                />
              )}

              {/* Local Video (PiP) — only for video calls */}
              {callType === 'video' && (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    position: 'absolute',
                    bottom: '80px',
                    right: '40px',
                    width: '240px',
                    height: '180px',
                    borderRadius: '12px',
                    background: '#000',
                    objectFit: 'cover',
                    border: '3px solid #8a66ff',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)'
                  }}
                />
              )}

              {/* Audio Call UI */}
              {callType === 'audio' && (
                <Box sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '280px',
                  paddingTop: '30px'
                }}>
                  <Box sx={{
                    position: 'relative',
                    marginBottom: '20px'
                  }}>
                    <Avatar sx={{
                      width: 120,
                      height: 120,
                      background: 'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)',
                      fontSize: '60px',
                      boxShadow: '0 0 40px rgba(138, 102, 255, 0.4)',
                      animation: connected ? 'none' : 'pulse 2s infinite'
                    }}>
                      {getAvatarEmoji(selectedFriend.name)}
                    </Avatar>
                    {/* Pulsing ring animation when connecting */}
                    {!connected && (
                      <Box sx={{
                        position: 'absolute',
                        top: -8,
                        left: -8,
                        width: 136,
                        height: 136,
                        borderRadius: '50%',
                        border: '2px solid rgba(138, 102, 255, 0.5)',
                        animation: 'pulse-ring 1.5s ease-out infinite'
                      }} />
                    )}
                  </Box>
                  <Typography sx={{ color: '#fff', fontSize: '24px', fontWeight: 600, mb: 1 }}>
                    {selectedFriend.name}
                  </Typography>
                  <Typography sx={{
                    color: connected ? '#10b981' : 'rgba(255, 255, 255, 0.6)',
                    fontSize: '16px',
                    fontWeight: connected ? 600 : 400
                  }}>
                    {connected ? '🔊 Audio Call Connected' : '📞 Connecting...'}
                  </Typography>
                  {isMuted && (
                    <Typography sx={{ color: '#ef4444', fontSize: '14px', mt: 1 }}>
                      🔇 You are muted
                    </Typography>
                  )}
                </Box>
              )}

              {/* Call Controls */}
              <Box sx={{
                position: callType === 'video' ? 'absolute' : 'relative',
                bottom: callType === 'video' ? '20px' : 'auto',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: 2,
                background: callType === 'video' ? 'rgba(0, 0, 0, 0.7)' : 'rgba(138, 102, 255, 0.1)',
                padding: '15px 30px',
                borderRadius: '50px',
                backdropFilter: 'blur(10px)',
                marginTop: callType === 'audio' ? '20px' : '0'
              }}>
                <IconButton
                  onClick={handleToggleMute}
                  sx={{
                    background: isMuted ? '#ef4444' : 'rgba(138, 102, 255, 0.3)',
                    color: '#fff',
                    width: 56,
                    height: 56,
                    '&:hover': {
                      background: isMuted ? '#dc2626' : 'rgba(138, 102, 255, 0.5)',
                    }
                  }}
                >
                  {isMuted ? <MicOff /> : <Mic />}
                </IconButton>

                {callType === 'video' && (
                  <IconButton
                    onClick={handleToggleVideo}
                    sx={{
                      background: isVideoOff ? '#ef4444' : 'rgba(138, 102, 255, 0.3)',
                      color: '#fff',
                      width: 56,
                      height: 56,
                      '&:hover': {
                        background: isVideoOff ? '#dc2626' : 'rgba(138, 102, 255, 0.5)',
                      }
                    }}
                  >
                    {isVideoOff ? <VideocamOff /> : <VideocamOn />}
                  </IconButton>
                )}

                <IconButton
                  onClick={handleEndCall}
                  sx={{
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    color: '#fff',
                    width: 56,
                    height: 56,
                    '&:hover': {
                      background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                    }
                  }}
                >
                  <CallEnd />
                </IconButton>
              </Box>
            </Paper>
          )}

          {loading && !inCall && !incomingCall && (
            <Box sx={{ textAlign: 'center', marginTop: '20px' }}>
              <CircularProgress sx={{ color: '#8a66ff' }} />
              <Typography sx={{ color: '#fff', marginTop: '10px' }}>
                {connected ? 'Starting call...' : 'Connecting...'}
              </Typography>
            </Box>
          )}
        </Box>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <Navbar username={username} walletAddress={walletAddress} onLogout={onLogout} />

      <div style={styles.contentWrapper}>
        <div style={styles.header}>
          <h1 style={styles.title}>📞 Voice & Video Calls</h1>
          <p style={styles.subtitle}>
            Make secure peer-to-peer calls with your friends
          </p>
        </div>

        <Paper sx={{
          background: 'linear-gradient(135deg, rgba(138, 102, 255, 0.1) 0%, rgba(255, 140, 66, 0.1) 100%)',
          border: '1px solid rgba(138, 102, 255, 0.3)',
          borderRadius: '16px',
          padding: '30px',
          minHeight: '500px'
        }}>
          {loading ? (
            <Box sx={{ textAlign: 'center', padding: '60px' }}>
              <CircularProgress sx={{ color: '#8a66ff' }} />
              <Typography sx={{ color: '#fff', marginTop: '20px' }}>
                Loading friends...
              </Typography>
            </Box>
          ) : friends.length === 0 ? (
            <Box sx={{ textAlign: 'center', padding: '60px' }}>
              <Typography sx={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '18px' }}>
                No friends added yet. Add friends to start calling!
              </Typography>
            </Box>
          ) : (
            <>
              <Typography sx={{
                color: '#fff',
                fontSize: '20px',
                fontWeight: 600,
                marginBottom: '20px'
              }}>
                Select a friend to call
              </Typography>
              <List>
                {friends.map((friend, index) => (
                  <React.Fragment key={friend.address}>
                    <ListItem
                      sx={{
                        background: 'rgba(138, 102, 255, 0.05)',
                        borderRadius: '12px',
                        marginBottom: '10px',
                        padding: '20px',
                        transition: 'all 0.3s ease',
                        '&:hover': {
                          background: 'rgba(138, 102, 255, 0.15)',
                          transform: 'translateX(5px)'
                        }
                      }}
                    >
                      <ListItemAvatar>
                        <Avatar sx={{
                          width: 56,
                          height: 56,
                          background: 'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)',
                          fontSize: '28px'
                        }}>
                          {getAvatarEmoji(friend.name)}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Typography sx={{ color: '#fff', fontSize: '18px', fontWeight: 600 }}>
                            {friend.name}
                          </Typography>
                        }
                        secondary={
                          <Typography sx={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '14px' }}>
                            {friend.address.substring(0, 8)}...{friend.address.slice(-6)}
                          </Typography>
                        }
                      />
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <IconButton
                          onClick={() => handleStartCall(friend, 'video')}
                          sx={{
                            background: 'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)',
                            color: '#fff',
                            width: 48,
                            height: 48,
                            '&:hover': {
                              background: 'linear-gradient(135deg, #9975ff 0%, #7755dd 100%)',
                            }
                          }}
                          title="Video Call"
                        >
                          <Videocam />
                        </IconButton>
                        <IconButton
                          onClick={() => handleStartCall(friend, 'audio')}
                          sx={{
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: '#fff',
                            width: 48,
                            height: 48,
                            '&:hover': {
                              background: 'linear-gradient(135deg, #14c992 0%, #06a877 100%)',
                            }
                          }}
                          title="Audio Call"
                        >
                          <Call />
                        </IconButton>
                      </Box>
                    </ListItem>
                    {index < friends.length - 1 && <Divider sx={{ background: 'rgba(138, 102, 255, 0.1)' }} />}
                  </React.Fragment>
                ))}
              </List>
            </>
          )}
        </Paper>
      </div>
    </div>
  );
};

export default Calls;
