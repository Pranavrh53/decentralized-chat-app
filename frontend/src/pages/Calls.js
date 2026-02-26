import React, { useState, useEffect, useRef, useCallback } from 'react';
import Navbar from '../components/Navbar';
import { initWeb3, getWeb3 } from '../utils/blockchain';
import ChatMetadataABI from '../abis/ChatMetadata.json';
import {
  createPeer,
  setupSignaling,
  setGlobalCallbacks,
  cleanup,
  getUserMedia,
  stopUserMedia,
  setAudioMuted,
  setVideoEnabled
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

// Cache buster - increment version to force reload
console.log('[Calls.js] 🔥 LOADED - Version 8.0 - FIXED REMOTE VIDEO 🔥');

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
  const handleIncomingMessageRef = useRef(null);
  const friendsRef = useRef([]);
  const pendingCallTypeRef = useRef(null);
  const selectedFriendRef = useRef(null);
  const incomingCallRef = useRef(null);

  // Keep refs in sync with state (for cases where state is set directly)
  useEffect(() => {
    if (selectedFriend !== selectedFriendRef.current) {
      selectedFriendRef.current = selectedFriend;
    }
  }, [selectedFriend]);

  useEffect(() => {
    if (incomingCall !== incomingCallRef.current) {
      incomingCallRef.current = incomingCall;
    }
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
      // Try both normalized and original case keys for backward compatibility
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
      friendsRef.current = mergedFriends; // Keep ref in sync
    } catch (err) {
      console.error('Error loading friends:', err);
      setError('Failed to load friends');
    } finally {
      setLoading(false);
    }
  };

  // Handle remote stream
  const onStream = useCallback((stream) => {
    console.log('[Calls] 📹 Received remote stream');
    console.log('[Calls] Stream ID:', stream.id);
    console.log('[Calls] Stream tracks:', stream.getTracks().map(t => `${t.kind}: ${t.label} (enabled: ${t.enabled})`));
    
    if (remoteVideoRef.current) {
      console.log('[Calls] Setting remote video srcObject');
      remoteVideoRef.current.srcObject = stream;
      
      // Ensure video starts playing
      remoteVideoRef.current.play().then(() => {
        console.log('[Calls] ✅ Remote video started playing');
      }).catch(err => {
        console.error('[Calls] Error playing remote video:', err);
      });
    } else {
      console.error('[Calls] ❌ remoteVideoRef.current is null!');
    }
  }, []);

  // Handle incoming messages
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

      // Handle call signaling
      if (messageData.type === 'call-request') {
        console.log('[Calls] 📞 Received call-request:', messageData.callType, 'from:', messageData.from);
        console.log('[Calls] 🔍 Searching in friends list of', friendsRef.current.length);
        
        // Find the friend who is calling (use friendsRef to get latest list)
        const callingFriend = friendsRef.current.find(f => 
          f.address.toLowerCase() === messageData.from.toLowerCase()
        );
        
        if (callingFriend) {
          console.log('[Calls] ✅ Found friend:', callingFriend.name);
          console.log('[Calls] 🎯 Setting selectedFriend to:', callingFriend.name);
          
          // Update refs BEFORE setting state to prevent cleanup from destroying peer
          selectedFriendRef.current = callingFriend;
          const incomingCallData = {
            from: messageData.from,
            callType: messageData.callType
          };
          incomingCallRef.current = incomingCallData;
          
          console.log('[Calls] 📦 Updated refs - selectedFriend:', selectedFriendRef.current.name, 'incomingCall:', !!incomingCallRef.current);
          
          // Now update state (this will trigger effects and cleanups)
          setSelectedFriend(callingFriend);
          setIsInitiator(false); // We are the responder
          setIncomingCall(incomingCallData);
          
          console.log('[Calls] ✅ State updated, peer should be preserved');
        } else {
          console.warn('[Calls] ⚠️ Friend not found for address:', messageData.from);
          console.log('[Calls] Available friends:', friendsRef.current.map(f => ({ name: f.name, addr: f.address })));
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
  }, []); // No dependencies - use refs for everything

  useEffect(() => {
    handleIncomingMessageRef.current = handleIncomingMessage;
  }, [handleIncomingMessage]);

  // Auto-responder setup
  useEffect(() => {
    if (selectedFriend && !isInitiator) {
      console.log('[Calls] 🔁 Auto-responder effect for:', selectedFriend.name);
      console.log('[Calls] Current peer state - exists:', !!peerRef.current, 'destroyed:', peerRef.current?.destroyed);
      
      // DON'T destroy peer if it already exists and is working - global listener created it
      if (peerRef.current && !peerRef.current.destroyed) {
        const iceState = peerRef.current._pc?.iceConnectionState;
        const dataChannelState = peerRef.current._channel?.readyState;
        console.log('[Calls] Peer already exists - ICE:', iceState, 'DataChannel:', dataChannelState);
        
        // Peer is working - keep it and just ensure we're connected
        if (iceState === 'connected' || iceState === 'completed' || dataChannelState === 'open') {
          console.log('[Calls] ✅ Peer is working, keeping it for incoming call!');
          setConnected(true);
          // Don't return - we still need to setup responder signaling for ICE candidates
        } else if (iceState === 'failed' || iceState === 'closed') {
          console.log('[Calls] ⚠️ Peer connection dead, will recreate');
          peerRef.current.destroy();
          peerRef.current = null;
        } else {
          // Peer is still connecting
          console.log('[Calls] ⏳ Peer still connecting, keeping it');
          return; // Let it finish connecting
        }
      }
      
      // Only setup new peer if we don't have one
      if (!peerRef.current) {
        console.log('[Calls] 🔧 Setting up new responder peer');
        
        const onData = (data) => {
          if (handleIncomingMessageRef.current) {
            handleIncomingMessageRef.current(data);
          }
        };
        
        const onConnect = () => {
          console.log('[Calls] ✅ Responder connected!');
          setConnected(true);
          
          // If there's a pending call, initiate it now that connection is ready
          const pendingType = pendingCallTypeRef.current;
          if (pendingType) {
            console.log('[Calls] 📡 Responder has pending call:', pendingType);
            setTimeout(() => {
              console.log('[Calls] 🎬 Responder initiating pending call:', pendingType);
              initiateCall(pendingType);
              pendingCallTypeRef.current = null;
            }, 1500);
          } else {
            console.log('[Calls] ✅ Responder ready to receive calls');
          }
        };
        
        const onError = (err) => {
          console.error('[Calls] Responder error:', err);
          // Only set error state for user-visible errors
          if (err.message !== 'Timeout' && err.message !== 'Connection failed') {
            setError(err.message);
          }
          setConnected(false);
        };
        
        setGlobalCallbacks(onData, onConnect, onError);

        const handleSignal = (signal) => {
          if (signal.type === 'answer') return;
          
          if (!peerRef.current) {
            if (signal.type === 'offer') {
              peerRef.current = createPeer(false, walletAddress, selectedFriend.address, onData, onConnect, onError, null, onStream);
              try {
                peerRef.current.signal(signal);
              } catch (err) {
                console.error('[Calls] Error signaling offer:', err);
              }
            }
            return;
          }
          
          if (peerRef.current && !peerRef.current.destroyed && peerRef.current._pc) {
            const iceState = peerRef.current._pc.iceConnectionState;
            
            if (signal.type === 'offer' && iceState === 'connected') {
              return;
            }
            
            if (iceState === 'failed' || iceState === 'disconnected' || iceState === 'closed') {
              peerRef.current.destroy();
              peerRef.current = null;
              
              if (signal.type === 'offer') {
                peerRef.current = createPeer(false, walletAddress, selectedFriend.address, onData, onConnect, onError, null, onStream);
                try {
                  peerRef.current.signal(signal);
                } catch (err) {
                  console.error('[Calls] Error signaling offer:', err);
                }
              }
              return;
            }
            
            try {
              peerRef.current.signal(signal);
            } catch (err) {
              console.error('[Calls] Error signaling peer:', err);
            }
          }
        };

        setupSignaling(walletAddress, handleSignal, selectedFriend.address);
      }
      
      return () => {
        console.log('[Calls] 🧹 Auto-responder cleanup, isInitiator:', isInitiator, 'inCall:', inCall);
        // Don't cleanup if we're in a call or about to accept one
        if (!isInitiator && !inCall) {
          cleanup(false); // Non-force cleanup - won't destroy if connected
        }
      };
    }
  }, [selectedFriend, walletAddress, onStream, inCall]); // Added inCall to dependencies

  // Global listener for incoming calls when viewing friends list (no friend selected)
  useEffect(() => {
    if (!selectedFriend && walletAddress) {
      console.log('[Calls] 🎧 Setting up global incoming call listener for:', walletAddress);
      console.log('[Calls] 👥 Friends available:', friendsRef.current.length);
      
      const onData = (data) => {
        console.log('[Calls] 📨 Global listener received data:', data);
        if (handleIncomingMessageRef.current) {
          handleIncomingMessageRef.current(data);
        }
      };
      
      const onConnect = () => {
        console.log('[Calls] ✅ Global listener connected');
        setConnected(true);
      };
      
      const onError = (err) => {
        console.warn('[Calls] ⚠️ Global listener connection issue:', err.message);
        // Don't set error state for global listener - it's just standing by
        // Only log it for debugging
      };
      
      setGlobalCallbacks(onData, onConnect, onError);

      // Listen for incoming offers from any friend
      const handleGlobalSignal = (signal) => {
        console.log('[Calls] 📡 Global signal received:', signal.type);
        
        // Handle offers to establish peer connection for signaling
        if (signal.type === 'offer') {
          const fromAddress = signal.from;
          console.log('[Calls] 📞 Received offer from:', fromAddress);
          
          // Check if we already have a peer - don't recreate if it exists and is not destroyed
          if (peerRef.current && !peerRef.current.destroyed) {
            console.log('[Calls] ⚠️ Peer already exists, ignoring duplicate offer');
            return;
          }
          
          if (fromAddress) {
            // Find which friend is calling
            const callingFriend = friendsRef.current.find(f => 
              f.address.toLowerCase() === fromAddress.toLowerCase()
            );
            
            if (callingFriend) {
              console.log('[Calls] ✅ Found calling friend:', callingFriend.name);
              console.log('[Calls] 🔗 Creating NEW peer connection for signaling');
              peerRef.current = createPeer(false, walletAddress, callingFriend.address, onData, onConnect, onError, null, onStream);
              
              try {
                peerRef.current.signal(signal);
                console.log('[Calls] ✅ Signaled offer to new peer');
              } catch (err) {
                console.error('[Calls] ❌ Error signaling global offer:', err);
              }
            } else {
              console.warn('[Calls] ⚠️ Offer from unknown address:', fromAddress);
            }
          }
        }
      };

      setupSignaling(walletAddress, handleGlobalSignal, '');
      
      return () => {
        console.log('[Calls] 🧹 Global listener cleanup');
        // Use refs to get current values (not closure values)
        const currentSelectedFriend = selectedFriendRef.current;
        const currentIncomingCall = incomingCallRef.current;
        const currentPeer = peerRef.current;
        
        console.log('[Calls] -- selectedFriend:', currentSelectedFriend?.name || 'none');
        console.log('[Calls] -- incomingCall:', currentIncomingCall ? 'yes' : 'no');
        console.log('[Calls] -- peer exists:', !!currentPeer, 'destroyed:', currentPeer?.destroyed);
        
        // DON'T cleanup if:
        // 1. We have a selected friend (transitioning to call)
        // 2. We have an incoming call notification
        // 3. Peer is connected and working
        if (currentSelectedFriend || currentIncomingCall) {
          console.log('[Calls] ✅ Active call state detected, preserving peer connection');
          return;
        }
        
        if (currentPeer && !currentPeer.destroyed) {
          const iceState = currentPeer._pc?.iceConnectionState;
          const dataChannelState = currentPeer._channel?.readyState;
          
          if (iceState === 'connected' || iceState === 'completed' || dataChannelState === 'open') {
            console.log('[Calls] ✅ Peer is connected, preserving it');
            return;
          }
        }
        
        console.log('[Calls] 🚮 No active call, performing cleanup');
        cleanup(true);
      };
    }
  }, [walletAddress]); // Removed selectedFriend and incomingCall from dependencies

  // Start connection as initiator
  const startConnection = (friend) => {
    console.log('[Calls] 🎬 Starting connection as initiator with:', friend.name);
    
    // Update refs first
    selectedFriendRef.current = friend;
    
    // Set state
    setSelectedFriend(friend);
    setIsInitiator(true);
    setError(null);
    setConnected(false);
    
    // Cleanup and setup with delay
    setTimeout(() => {
      console.log('[Calls] Performing cleanup and setup...');
      console.log('[Calls] Current peer before cleanup - exists:', !!peerRef.current, 'destroyed:', peerRef.current?.destroyed);
      
      // Only cleanup if peer is not already connected
      if (!peerRef.current || peerRef.current.destroyed || peerRef.current._pc?.iceConnectionState !== 'connected') {
        console.log('[Calls] Cleaning up old peer...');
        cleanup(true);
      } else {
        console.log('[Calls] Peer already connected, reusing it');
      }

      const onData = (data) => {
        if (handleIncomingMessageRef.current) {
          handleIncomingMessageRef.current(data);
        }
      };
      
      const onConnect = () => {
        console.log('[Calls] ✅ Initiator connected!');
        setConnected(true);
        
        // If there's a pending call, initiate it now that connection is ready
        const pendingType = pendingCallTypeRef.current;
        if (pendingType) {
          console.log('[Calls] 📡 Pending call detected:', pendingType);
          // Give a bit more time for data channel to fully stabilize
          setTimeout(() => {
            console.log('[Calls] 🎬 Now initiating pending call:', pendingType);
            initiateCall(pendingType);
            pendingCallTypeRef.current = null;
          }, 1500); // Increased to 1.5 seconds for stability
        } else {
          console.log('[Calls] ⚠️ Connected but no pending call');
        }
      };
      
      const onError = (err) => {
        console.error('[Calls] Initiator error:', err);
        // Only set error state for user-visible errors
        if (err.message !== 'Timeout' && err.message !== 'Connection failed') {
          setError(err.message);
        }
        setConnected(false);
      };
      
      setGlobalCallbacks(onData, onConnect, onError);

      const handleSignal = (signal) => {
        console.log('[Calls] Initiator handleSignal received:', signal.type);
        
        if (signal.type === 'offer') {
          console.log('[Calls] Initiator ignoring offer (we sent it)');
          return;
        }
        
        if (!peerRef.current || peerRef.current.destroyed) {
          console.warn('[Calls] ⚠️ No peer to signal to');
          return;
        }
        
        if (!peerRef.current._pc) {
          console.warn('[Calls] ⚠️ Peer has no peer connection');
          return;
        }
        
        const signalingState = peerRef.current._pc.signalingState;
        const iceState = peerRef.current._pc.iceConnectionState;
        
        console.log('[Calls] Peer states - signaling:', signalingState, 'ice:', iceState);
        
        // Don't process answer if already in stable state
        if (signal.type === 'answer' && signalingState === 'stable') {
          console.log('[Calls] Ignoring answer - already stable');
          return;
        }
        
        // Don't process answer if already connected
        if (signal.type === 'answer' && iceState === 'connected') {
          console.log('[Calls] Ignoring answer - already connected');
          return;
        }
        
        try {
          console.log('[Calls] ✅ Signaling', signal.type, 'to peer');
          peerRef.current.signal(signal);
        } catch (err) {
          console.error('[Calls] Error signaling peer:', err);
        }
      };

      
      // Small delay before creating connections
      setTimeout(() => {
        console.log('[Calls] Creating peer and signaling...');
        setupSignaling(walletAddress, handleSignal, friend.address);
        peerRef.current = createPeer(true, walletAddress, friend.address, onData, onConnect, onError, null, onStream);
      }, 200);
    }, 100);
  };

  // Call functions
  const handleStartCall = async (friend, type) => {
    console.log('[Calls] 📞 handleStartCall called:', friend.name, type);
    console.log('[Calls] Current state - connected:', connected, 'peerRef exists:', !!peerRef.current);
    
    setSelectedFriend(friend);
    pendingCallTypeRef.current = type; // Store in ref to avoid stale closures
    console.log('[Calls] 💾 Stored pending call type in ref:', pendingCallTypeRef.current);
    
    // If not connected, establish connection first
    if (!connected || !peerRef.current) {
      console.log('[Calls] Not connected, starting connection...');
      startConnection(friend);
      return;
    }
    
    // Already connected, initiate call immediately
    console.log('[Calls] Already connected, initiating call...');
    initiateCall(type);
    pendingCallTypeRef.current = null;
  };

  const initiateCall = async (type) => {
    console.log('[Calls] 📡 initiateCall called with type:', type);
    
    if (!peerRef.current) {
      console.error('[Calls] ❌ No peer reference!');
      setError('Connection not established. Please try again.');
      return;
    }

    console.log('[Calls] Peer exists, destroyed?', peerRef.current.destroyed);

    // Check if data channel is ready
    const dataChannel = peerRef.current._channel;
    console.log('[Calls] Data channel state:', dataChannel?.readyState);
    
    if (!dataChannel) {
      console.warn('[Calls] ⚠️ Data channel does not exist yet, retrying in 1s...');
      setTimeout(() => initiateCall(type), 1000);
      return;
    }
    
    if (dataChannel.readyState !== 'open') {
      console.warn('[Calls] ⚠️ Data channel not open (state:', dataChannel.readyState, '), retrying in 1s...');
      // Retry after delay
      setTimeout(() => initiateCall(type), 1000);
      return;
    }

    try {
      console.log('[Calls] 🎤 Getting user media...');
      setLoading(true);
      const video = type === 'video';
      const audio = true;

      // Get user media FIRST
      const stream = await getUserMedia(video, audio);
      console.log('[Calls] ✅ Got user media stream');
      
      // Display local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        console.log('[Calls] ✅ Set local video stream');
      }

      // Send call request via existing data channel
      const callRequest = {
        type: 'call-request',
        callType: type,
        from: walletAddress
      };
      
      console.log('[Calls] 📤 Sending call-request:', callRequest);
      try {
        peerRef.current.send(JSON.stringify(callRequest));
        console.log('[Calls] ✅ Call request sent successfully');
      } catch (err) {
        console.error('[Calls] ❌ Error sending call-request:', err);
        throw new Error('Failed to send call request');
      }

      // CLEAN APPROACH: Destroy old peer and create new one with media
      console.log('[Calls] 🔄 Recreating peer connection with media...');
      const oldPeer = peerRef.current;
      
      // Callbacks for new peer
      const onData = (data) => {
        if (handleIncomingMessageRef.current) {
          handleIncomingMessageRef.current(data);
        }
      };
      
      const onConnect = () => {
        console.log('[Calls] ✅ Media peer connected!');
        setConnected(true);
      };
      
      const onError = (err) => {
        console.error('[Calls] Media peer error:', err);
        if (err.message !== 'Timeout' && err.message !== 'Connection failed') {
          setError(err.message);
        }
      };

      // Setup signaling and callbacks
      setGlobalCallbacks(onData, onConnect, onError);
      
      // Create new peer WITH stream as initiator (use ref to get current value)
      const friendAddress = selectedFriendRef.current?.address;
      if (!friendAddress) {
        throw new Error('Friend address not found');
      }
      peerRef.current = createPeer(true, walletAddress, friendAddress, onData, onConnect, onError, stream, onStream);
      console.log('[Calls] ✅ Created new peer with media');
      
      // Destroy old peer after a short delay
      setTimeout(() => {
        if (oldPeer && !oldPeer.destroyed) {
          console.log('[Calls] 🗑️ Destroying old data-only peer');
          oldPeer.destroy();
        }
      }, 1000);

      setInCall(true);
      setCallType(type);
      setLoading(false);
      console.log('[Calls] 🎉 Call initiated successfully!');
    } catch (error) {
      console.error('[Calls] ❌ Error starting call:', error);
      setError(`Failed to start ${type} call: ${error.message}`);
      setLoading(false);
    }
  };

  const handleAcceptCall = async () => {
    if (!incomingCall) return;

    console.log('[Calls] 📞 Accepting call...');
    console.log('[Calls] Peer exists?', !!peerRef.current, 'Destroyed?', peerRef.current?.destroyed);
    
    // Check if peer exists and is not destroyed
    if (!peerRef.current || peerRef.current.destroyed) {
      console.error('[Calls] ❌ Peer is destroyed, cannot accept call');
      setError('Connection lost. Please ask the caller to try again.');
      incomingCallRef.current = null;
      setIncomingCall(null);
      return;
    }

    try {
      setLoading(true);
      const video = incomingCall.callType === 'video';
      const audio = true;

      console.log('[Calls] 🎤 Getting user media for accept...');
      const stream = await getUserMedia(video, audio);
      console.log('[Calls] ✅ Got media stream');
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Check again before proceeding
      if (!peerRef.current || peerRef.current.destroyed) {
        console.error('[Calls] ❌ Peer destroyed while getting media');
        stopUserMedia();
        setError('Connection lost. Please ask the caller to try again.');
        incomingCallRef.current = null;
        setIncomingCall(null);
        setLoading(false);
        return;
      }

      // Send call-accepted via existing peer
      const callAccepted = {
        type: 'call-accepted',
        callType: incomingCall.callType
      };
      
      try {
        peerRef.current.send(JSON.stringify(callAccepted));
        console.log('[Calls] ✅ Sent call-accepted');
      } catch (err) {
        console.error('[Calls] Error sending call-accepted:', err);
      }

      // CLEAN APPROACH: Destroy old peer and create new one with media as responder
      console.log('[Calls] 🔄 Recreating peer connection with media as responder...');
      const oldPeer = peerRef.current;
      
      const onData = (data) => {
        if (handleIncomingMessageRef.current) {
          handleIncomingMessageRef.current(data);
        }
      };
      
      const onConnect = () => {
        console.log('[Calls] ✅ Responder media peer connected!');
        setConnected(true);
      };
      
      const onError = (err) => {
        console.error('[Calls] Responder peer error:', err);
        if (err.message !== 'Timeout') {
          setError(err.message);
        }
      };

      // Setup signaling and callbacks  
      setGlobalCallbacks(onData, onConnect, onError);
      
      // Create new peer WITH stream as responder (not initiator) - use ref for current value
      const friendAddress = selectedFriendRef.current?.address;
      if (!friendAddress) {
        throw new Error('Friend address not found');
      }
      peerRef.current = createPeer(false, walletAddress, friendAddress, onData, onConnect, onError, stream, onStream);
      console.log('[Calls] ✅ Created new responder peer with media');
      
      // Setup signaling to receive the new offer from initiator
      const handleSignal = (signal) => {
        if (peerRef.current && !peerRef.current.destroyed) {
          try {
            peerRef.current.signal(signal);
            console.log('[Calls] ✅ Signaled to responder peer:', signal.type || 'candidate');
          } catch (err) {
            console.error('[Calls] Error signaling to responder peer:', err);
          }
        }
      };
      
      setupSignaling(walletAddress, handleSignal, friendAddress);
      
      // Destroy old peer after a delay
      setTimeout(() => {
        if (oldPeer && !oldPeer.destroyed) {
          console.log('[Calls] 🗑️ Destroying old data-only peer');
          oldPeer.destroy();
        }
      }, 1000);

      setInCall(true);
      setCallType(incomingCall.callType);
      incomingCallRef.current = null;
      setIncomingCall(null);
      setLoading(false);
      console.log('[Calls] 🎉 Call accepted successfully!');
    } catch (error) {
      console.error('[Calls] Error accepting call:', error);
      setError(`Failed to accept call: ${error.message}`);
      setLoading(false);
    }
  };

  const handleRejectCall = () => {
    if (!incomingCall) return;

    if (peerRef.current && !peerRef.current.destroyed) {
      try {
        const dataChannel = peerRef.current._channel;
        if (dataChannel && dataChannel.readyState === 'open') {
          const callRejected = { type: 'call-rejected' };
          peerRef.current.send(JSON.stringify(callRejected));
        }
      } catch (err) {
        console.warn('[Calls] Error sending call-rejected:', err);
      }
    }
    
    // Update ref before state
    incomingCallRef.current = null;
    setIncomingCall(null);
  };

  const handleEndCall = () => {
    stopUserMedia();
    
    if (peerRef.current && !peerRef.current.destroyed) {
      try {
        const dataChannel = peerRef.current._channel;
        if (dataChannel && dataChannel.readyState === 'open') {
          const callEnded = { type: 'call-ended' };
          peerRef.current.send(JSON.stringify(callEnded));
        }
      } catch (err) {
        console.warn('[Calls] Error sending call-ended:', err);
      }
    }

    setInCall(false);
    setCallType(null);
    setIsMuted(false);
    setIsVideoOff(false);
    pendingCallTypeRef.current = null;
    
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
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
    
    // Update refs before state
    selectedFriendRef.current = null;
    incomingCallRef.current = null;
    
    setSelectedFriend(null);
    setConnected(false);
    pendingCallTypeRef.current = null;
    cleanup(true);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup(false);
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
                  sx={{
                    background: '#fff',
                    color: '#10b981',
                    '&:hover': { background: '#f0f0f0' }
                  }}
                >
                  Accept
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

          {/* Call Buttons (when not in call) */}
          {!inCall && connected && !incomingCall && (
            <Paper sx={{
              background: 'rgba(138, 102, 255, 0.1)',
              border: '1px solid rgba(138, 102, 255, 0.3)',
              borderRadius: '16px',
              padding: '40px',
              textAlign: 'center'
            }}>
              <Typography sx={{ color: '#fff', fontSize: '20px', marginBottom: '30px' }}>
                Start a call with {selectedFriend.name}
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                <Button
                  variant="contained"
                  startIcon={<Videocam />}
                  onClick={() => initiateCall('video')}
                  disabled={loading}
                  sx={{
                    background: 'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)',
                    padding: '15px 40px',
                    fontSize: '18px',
                    borderRadius: '12px',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #9975ff 0%, #7755dd 100%)',
                    }
                  }}
                >
                  Video Call
                </Button>
                <Button
                  variant="contained"
                  startIcon={<Call />}
                  onClick={() => initiateCall('audio')}
                  disabled={loading}
                  sx={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    padding: '15px 40px',
                    fontSize: '18px',
                    borderRadius: '12px',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #14c992 0%, #06a877 100%)',
                    }
                  }}
                >
                  Audio Call
                </Button>
              </Box>
            </Paper>
          )}

          {/* Video Call Interface */}
          {inCall && (
            <Paper sx={{
              background: '#000',
              borderRadius: '16px',
              padding: '20px',
              position: 'relative',
              minHeight: '500px'
            }}>
              {/* Remote Video */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted={false}
                style={{
                  width: '100%',
                  height: '500px',
                  borderRadius: '12px',
                  background: '#000',
                  objectFit: 'cover',
                }}
              />
              
              {/* Local Video (PiP) */}
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

              {/* Audio Only Indicator */}
              {callType === 'audio' && (
                <Box sx={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center'
                }}>
                  <Avatar sx={{
                    width: 120,
                    height: 120,
                    background: 'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)',
                    fontSize: '60px',
                    margin: '0 auto 20px'
                  }}>
                    {getAvatarEmoji(selectedFriend.name)}
                  </Avatar>
                  <Typography sx={{ color: '#fff', fontSize: '24px', fontWeight: 600 }}>
                    {selectedFriend.name}
                  </Typography>
                  <Typography sx={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '16px' }}>
                    Audio Call in Progress
                  </Typography>
                </Box>
              )}

              {/* Call Controls */}
              <Box sx={{
                position: 'absolute',
                bottom: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: 2,
                background: 'rgba(0, 0, 0, 0.7)',
                padding: '15px 30px',
                borderRadius: '50px',
                backdropFilter: 'blur(10px)'
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

          {loading && !inCall && (
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
