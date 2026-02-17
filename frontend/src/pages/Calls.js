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
  const [pendingCallType, setPendingCallType] = useState(null);

  // Refs
  const peerRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const handleIncomingMessageRef = useRef(null);
  const friendsRef = useRef([]);

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
    console.log('[Calls] Received remote stream');
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream;
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
          setSelectedFriend(callingFriend);
          setIsInitiator(false); // We are the responder
        } else {
          console.warn('[Calls] ⚠️ Friend not found for address:', messageData.from);
          console.log('[Calls] Available friends:', friendsRef.current.map(f => ({ name: f.name, addr: f.address })));
        }
        
        console.log('[Calls] 🔔 Setting incoming call notification');
        setIncomingCall({
          from: messageData.from,
          callType: messageData.callType
        });
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
      console.log('[Calls] Setting up auto-responder');
      
      if (peerRef.current && !peerRef.current.destroyed) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
      
      const onData = (data) => {
        if (handleIncomingMessageRef.current) {
          handleIncomingMessageRef.current(data);
        }
      };
      
      const onConnect = () => {
        console.log('[Calls] Responder connected!');
        setConnected(true);
        
        // If there's a pending call, initiate it now that connection is ready
        if (pendingCallType) {
          console.log('[Calls] Initiating pending call:', pendingCallType);
          setTimeout(() => {
            initiateCall(pendingCallType);
            setPendingCallType(null);
          }, 500); // Small delay to ensure data channel is fully ready
        }
      };
      
      const onError = (err) => {
        console.error('[Calls] Responder error:', err);
        setError(err.message);
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
      
      return () => {
        console.log('[Calls] Auto-responder cleanup');
        cleanup(false);
      };
    }
  }, [selectedFriend, walletAddress, isInitiator, onStream]);

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
        console.error('[Calls] ❌ Global listener error:', err);
      };
      
      setGlobalCallbacks(onData, onConnect, onError);

      // Listen for incoming offers from any friend
      const handleGlobalSignal = (signal) => {
        console.log('[Calls] 📡 Global signal received:', signal.type);
        // Handle offers to establish peer connection for signaling
        if (signal.type === 'offer') {
          const fromAddress = signal.from;
          console.log('[Calls] 📞 Received offer from:', fromAddress);
          
          if (fromAddress) {
            // Find which friend is calling
            const callingFriend = friendsRef.current.find(f => 
              f.address.toLowerCase() === fromAddress.toLowerCase()
            );
            
            if (callingFriend) {
              console.log('[Calls] ✅ Found calling friend:', callingFriend.name);
              // Note: Don't auto-select friend in UI yet - that happens when call-request arrives
              // Only create peer connection for signaling
              
              // Set up peer connection for this specific friend (but don't show in UI)
              if (!peerRef.current || peerRef.current.destroyed) {
                console.log('[Calls] 🔗 Creating peer connection for signaling');
                peerRef.current = createPeer(false, walletAddress, callingFriend.address, onData, onConnect, onError, null, onStream);
              }
              
              try {
                peerRef.current.signal(signal);
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
        console.log('[Calls] 🧹 Global listener cleanup - closing WebSocket');
        // Only cleanup if we're not transitioning to a call
        // The startConnection function will handle its own cleanup
        if (!selectedFriend) {
          cleanup(true);
        }
      };
    }
  }, [selectedFriend, walletAddress]);

  // Start connection as initiator
  const startConnection = (friend) => {
    console.log('[Calls] 🎬 Starting connection as initiator with:', friend.name);
    
    // Cleanup global listener first before setting selected friend
    cleanup(true);
    
    // Small delay to ensure cleanup completes
    setTimeout(() => {
      setSelectedFriend(friend);
      setIsInitiator(true);
      setError(null);
      setConnected(false);

      const onData = (data) => {
        if (handleIncomingMessageRef.current) {
          handleIncomingMessageRef.current(data);
        }
      };
      
      const onConnect = () => {
        console.log('[Calls] Initiator connected!');
        setConnected(true);
        
        // If there's a pending call, initiate it now that connection is ready
        if (pendingCallType) {
          console.log('[Calls] Initiating pending call:', pendingCallType);
          setTimeout(() => {
            initiateCall(pendingCallType);
            setPendingCallType(null);
          }, 500); // Small delay to ensure data channel is fully ready
        }
      };
      
      const onError = (err) => {
        console.error('[Calls] Initiator error:', err);
        setError(err.message);
        setConnected(false);
      };
      
      setGlobalCallbacks(onData, onConnect, onError);

      const handleSignal = (signal) => {
        if (signal.type === 'offer') return;
        
        if (peerRef.current && !peerRef.current.destroyed && peerRef.current._pc) {
          const signalingState = peerRef.current._pc.signalingState;
          const iceState = peerRef.current._pc.iceConnectionState;
          
          if (signal.type === 'answer' && (signalingState === 'stable' || iceState === 'connected')) {
            return;
          }
          
          try {
            peerRef.current.signal(signal);
          } catch (err) {
            console.error('[Calls] Error signaling peer:', err);
          }
        }
      };

      setupSignaling(walletAddress, handleSignal, friend.address);
      peerRef.current = createPeer(true, walletAddress, friend.address, onData, onConnect, onError, null, onStream);
    }, 100); // 100ms delay to ensure cleanup completes
  };

  // Call functions
  const handleStartCall = async (friend, type) => {
    setSelectedFriend(friend);
    
    // If not connected, establish connection first
    if (!connected || !peerRef.current) {
      setPendingCallType(type); // Store the call type to initiate after connection
      startConnection(friend);
      return;
    }
    
    initiateCall(type);
  };

  const initiateCall = async (type) => {
    if (!peerRef.current) {
      setError('Connection not established. Please try again.');
      return;
    }

    // Check if data channel is ready
    const dataChannel = peerRef.current._channel;
    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.log('[Calls] Data channel not ready, waiting...');
      setError('Connection not ready yet. Please wait a moment and try again.');
      return;
    }

    try {
      setLoading(true);
      const video = type === 'video';
      const audio = true;

      // Get user media
      const stream = await getUserMedia(video, audio);
      
      // Display local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Send call request
      const callRequest = {
        type: 'call-request',
        callType: type,
        from: walletAddress
      };
      peerRef.current.send(JSON.stringify(callRequest));

      // Add stream to peer
      stream.getTracks().forEach(track => {
        peerRef.current.addTrack(track, stream);
      });

      setInCall(true);
      setCallType(type);
      setLoading(false);
    } catch (error) {
      console.error('[Calls] Error starting call:', error);
      setError(`Failed to start ${type} call: ${error.message}`);
      setLoading(false);
    }
  };

  const handleAcceptCall = async () => {
    if (!incomingCall) return;

    try {
      setLoading(true);
      const video = incomingCall.callType === 'video';
      const audio = true;

      const stream = await getUserMedia(video, audio);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      stream.getTracks().forEach(track => {
        peerRef.current.addTrack(track, stream);
      });

      const callAccepted = {
        type: 'call-accepted',
        callType: incomingCall.callType
      };
      peerRef.current.send(JSON.stringify(callAccepted));

      setInCall(true);
      setCallType(incomingCall.callType);
      setIncomingCall(null);
      setLoading(false);
    } catch (error) {
      console.error('[Calls] Error accepting call:', error);
      setError(`Failed to accept call: ${error.message}`);
      setLoading(false);
    }
  };

  const handleRejectCall = () => {
    if (!incomingCall || !peerRef.current) return;

    const callRejected = { type: 'call-rejected' };
    peerRef.current.send(JSON.stringify(callRejected));
    setIncomingCall(null);
  };

  const handleEndCall = () => {
    stopUserMedia();
    
    if (peerRef.current && !peerRef.current.destroyed) {
      const callEnded = { type: 'call-ended' };
      peerRef.current.send(JSON.stringify(callEnded));
    }

    setInCall(false);
    setCallType(null);
    setIsMuted(false);
    setIsVideoOff(false);
    setPendingCallType(null);
    
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
    setSelectedFriend(null);
    setConnected(false);
    setPendingCallType(null);
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
