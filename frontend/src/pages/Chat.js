import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { createTheme, ThemeProvider } from '@mui/material/styles';

import { 
  initWeb3,
  storeMessageMetadata,
  getMessageMetadata,
  hashMessage 
} from "../utils/blockchain";
import { 
  Box, 
  TextField, 
  Button, 
  Typography, 
  Paper, 
  Avatar, 
  List, 
  ListItem, 
  ListItemText, 
  ListItemAvatar,
  Divider,
  IconButton,
  Tooltip,
  CircularProgress
} from "@mui/material";
import { Send as SendIcon, AccountCircle, Refresh as RefreshIcon } from "@mui/icons-material";
import { formatDistanceToNow } from 'date-fns';
import { createPeer, setupSignaling, cleanup, setGlobalCallbacks } from "../utils/webrtc";

// Create dark theme
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#8a66ff',
      light: '#9d7aff',
      dark: '#6644cc',
    },
    secondary: {
      main: '#ff6b9d',
    },
    background: {
      default: '#0a0e27',
      paper: '#1a1f3a',
    },
    text: {
      primary: '#ffffff',
      secondary: '#b8b8d1',
    },
    error: {
      main: '#ef4444',
    },
    success: {
      main: '#4ade80',
    },
  },
  typography: {
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'linear-gradient(135deg, #1a1f3a 0%, #2d1b4e 100%)',
          border: '1px solid rgba(138, 102, 255, 0.2)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            '& fieldset': {
              borderColor: 'rgba(138, 102, 255, 0.3)',
            },
            '&:hover fieldset': {
              borderColor: 'rgba(138, 102, 255, 0.5)',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#8a66ff',
            },
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: '10px',
          fontWeight: 600,
        },
        contained: {
          background: 'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)',
          boxShadow: '0 4px 15px rgba(138, 102, 255, 0.4)',
          '&:hover': {
            background: 'linear-gradient(135deg, #9d7aff 0%, #7755dd 100%)',
            boxShadow: '0 6px 20px rgba(138, 102, 255, 0.6)',
          },
        },
      },
    },
  },
});

function Chat({ walletAddress }) {
  const { friendAddress } = useParams();
  const [messages, setMessages] = useState([]);
  
  // Helper function to safely create date from message time
  const getMessageTime = (msg) => {
    if (!msg.time) return new Date();
    if (typeof msg.time === 'string') return new Date(msg.time);
    if (msg.time instanceof Date) return msg.time;
    return new Date();
  };
  
  const [receiver, setReceiver] = useState(
    friendAddress || localStorage.getItem('lastChatPartner') || ''
  );
  const [message, setMessage] = useState("");
  const [account, setAccount] = useState(walletAddress);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  const [isInitiator, setIsInitiator] = useState(false);
  const peerRef = useRef(null);
  const handleIncomingMessageRef = useRef(null);

  // Update receiver when friendAddress from URL changes
  useEffect(() => {
    if (friendAddress && friendAddress !== receiver) {
      setReceiver(friendAddress);
      localStorage.setItem('lastChatPartner', friendAddress);
    }
  }, [friendAddress, receiver]);

  // Load messages from blockchain
  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Try to load the last 10 messages
      const messagePromises = [];
      
      for (let i = 0; i < 10; i++) {
        messagePromises.push(
          getMessageMetadata(i).then(metadata => {
            if (metadata && metadata.messageHash) {
              return {
                ...metadata,
                id: i,
                time: new Date(),
                content: '',  // Placeholder—real content from P2P
                incoming: metadata.sender !== account,
                from: metadata.sender
              };
            }
            return null;
          }).catch(e => {
            // Skip non-critical errors
            if (!e.message.includes('not found')) {
              console.warn(`Error loading message ${i}:`, e);
            }
            return null;
          })
        );
      }
      
      // Wait for all messages to load
      const loadedMessages = await Promise.all(messagePromises);
      const validMessages = loadedMessages.filter(msg => msg !== null);
      
      setMessages(validMessages);
      
    } catch (err) {
      console.error("❌ Error loading messages:", err);
      setError(`Failed to load messages: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [account]);

  // Initialize web3 and load messages
  useEffect(() => {
    let mounted = true;
    
    const setup = async () => {
      try {
        // If MetaMask is available, try to initialize
        if (window.ethereum) {
          const { account: acc } = await initWeb3();
          if (!mounted) return;
          
          setAccount(acc);
          await loadMessages();
        } else {
          // No MetaMask, use the wallet address from props (manual entry)
          console.log('⚠️ MetaMask not available, using manual address');
          if (!mounted) return;
          setAccount(walletAddress);
          // Skip loading messages from blockchain
          setLoading(false);
        }
      } catch (err) {
        console.error("❌ Initialization failed:", err);
        // If initialization fails, still try to use the walletAddress
        if (mounted && walletAddress) {
          console.log('⚠️ Using manual address due to initialization failure');
          setAccount(walletAddress);
        }
        setError(`Note: Blockchain features unavailable. P2P chat still works.`);
        setLoading(false);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    
    setup();
    
    return () => { 
      mounted = false; 
    };
  }, [loadMessages, walletAddress]);

  // Handle incoming WebRTC messages
  const handleIncomingMessage = useCallback(async (data) => {
    console.log('[Chat] Raw incoming data:', data);
    
    try {
      let messageText;
      
      // Handle different data types
      if (typeof data === 'string') {
        try {
          // Try to parse as JSON
          const parsed = JSON.parse(data);
          messageText = parsed.text || parsed.content || data;
          console.log('[Chat] Parsed message text:', messageText);
        } catch (e) {
          // If not JSON, use as-is
          messageText = data;
          console.log('[Chat] Plain text message:', messageText);
        }
      } else if (data instanceof ArrayBuffer || data instanceof Blob) {
        // Handle binary data
        messageText = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = (e) => {
            console.error('[Chat] Error reading blob data:', e);
            resolve('(Binary data)');
          };
          reader.readAsText(new Blob([data]));
        });
      } else if (typeof data === 'object' && data !== null) {
        messageText = data.text || data.content || JSON.stringify(data);
      } else {
        messageText = String(data);
      }

      console.log('[Chat] Processed message text:', messageText);
      
      // Create new message object FIRST (before blockchain transaction)
      const newMsg = {
        id: Date.now(),
        content: messageText,
        text: messageText,
        sender: receiver,
        time: new Date(),
        timestamp: new Date().toISOString(),
        incoming: true,
        messageHash: null,
        from: receiver,
        status: 'received',
        type: 'text'
      };

      console.log('[Chat] Adding message to UI:', newMsg);
      
      // Update state IMMEDIATELY
      setMessages(prev => [...prev, newMsg]);
      
      // Save to local storage
      const chatKey = `chat_${account}_${receiver}`;
      const chatHistory = JSON.parse(localStorage.getItem(chatKey) || '[]');
      chatHistory.push(newMsg);
      localStorage.setItem(chatKey, JSON.stringify(chatHistory));
      console.log('[Chat] Message saved to local storage');
      
      // Hash & store on chain in the background (don't wait for it)
      try {
        console.log('[Chat] Storing message metadata on chain...');
        const hash = await hashMessage(messageText);
        await storeMessageMetadata(receiver, account, hash);
        console.log('[Chat] Message metadata stored on blockchain');
        
        // Update message with hash
        setMessages(prev => prev.map(msg => 
          msg.id === newMsg.id 
            ? { ...msg, messageHash: hash } 
            : msg
        ));
      } catch (err) {
        console.error('[Chat] Error storing message metadata on blockchain:', err);
        // Message still shows in UI, just without blockchain confirmation
      }

    } catch (err) {
      console.error('[Chat] Error processing incoming message:', err);
      setError('Process failed: ' + (err.message || 'Unknown error'));
    }
  }, [receiver, account]);

  // Store the latest handleIncomingMessage in ref
  useEffect(() => {
    handleIncomingMessageRef.current = handleIncomingMessage;
  }, [handleIncomingMessage]);

  // Auto-responder useEffect (only if not initiator)
  useEffect(() => {
    if (receiver && receiver !== account && !isInitiator) {
      console.log('[Chat] ===== AUTO-RESPONDER SETUP =====');
      console.log('[Chat] Receiver:', receiver);
      console.log('[Chat] Account:', account);
      console.log('[Chat] IsInitiator:', isInitiator);
      console.log('[Chat] Setting up auto-responder for', receiver);
      
      // Cleanup any stale peer before setting up responder
      if (peerRef.current && !peerRef.current.destroyed) {
        console.log('[Chat] Cleaning up stale responder peer');
        peerRef.current.destroy();
        peerRef.current = null;
      }
      
      // Set global callbacks FIRST before setting up signaling
      const onData = (data) => {
        console.log('[Chat] ===== RESPONDER RECEIVED DATA =====');
        console.log('[Chat] Responder received data:', data);
        if (handleIncomingMessageRef.current) {
          handleIncomingMessageRef.current(data);
        }
      };
      
      const onConnect = () => {
        console.log('[Chat] ===== RESPONDER CONNECTED =====');
        console.log('[Chat] Responder connected!');
        setConnected(true);
      };
      
      const onError = (err) => {
        console.error('[Chat] ===== RESPONDER ERROR =====');
        console.error('[Chat] Responder error:', err);
        setError(err.message);
        setConnected(false);
      };
      
      setGlobalCallbacks(onData, onConnect, onError);

      const handleSignal = (signal) => {
        console.log('[Chat] Responder signal received:', signal.type || 'candidate');
        
        // RESPONDER: Only process offers and candidates, NOT answers
        if (signal.type === 'answer') {
          console.log('[Chat] Responder ignoring answer signal (meant for initiator)');
          return;
        }
        
        // Check if peer already exists
        if (!peerRef.current) {
          // Only create peer if we receive an offer
          if (signal.type === 'offer') {
            console.log('[Chat] Creating new responder peer from offer');
            peerRef.current = createPeer(false, account, receiver, onData, onConnect, onError);
            
            // Signal the offer IMMEDIATELY after creating peer
            try {
              console.log('[Chat] Signaling offer to new responder peer');
              peerRef.current.signal(signal);
            } catch (err) {
              console.error('[Chat] Error signaling offer to new peer:', err);
            }
            return; // Don't process further
          } else {
            console.log('[Chat] Waiting for offer before creating peer');
            return;
          }
        }
        
        // Peer already exists, process additional signals
        if (peerRef.current && !peerRef.current.destroyed) {
          // Check connection state before processing offer again
          const signalingState = peerRef.current._pc.signalingState;
          const iceState = peerRef.current._pc.iceConnectionState;
          
          // Only ignore offer if truly connected and working
          if (signal.type === 'offer' && iceState === 'connected') {
            console.log('[Chat] Responder ignoring offer - already connected');
            return;
          }
          
          // If peer is failed/disconnected, destroy it and recreate
          if (iceState === 'failed' || iceState === 'disconnected' || iceState === 'closed') {
            console.log('[Chat] Responder peer in bad state, recreating:', iceState);
            peerRef.current.destroy();
            peerRef.current = null;
            
            if (signal.type === 'offer') {
              console.log('[Chat] Creating new responder peer from offer (after cleanup)');
              peerRef.current = createPeer(false, account, receiver, onData, onConnect, onError);
              try {
                peerRef.current.signal(signal);
              } catch (err) {
                console.error('[Chat] Error signaling offer to new peer:', err);
              }
            }
            return;
          }
          
          try {
            peerRef.current.signal(signal);
          } catch (err) {
            console.error('[Chat] Error signaling peer:', err);
          }
        }
      };

      setupSignaling(account, handleSignal, receiver);
      return () => {
        console.log('[Chat] Auto-responder effect cleanup');
        cleanup(false);
      };
    }
  }, [receiver, account]); // Don't include isInitiator - let startChat() handle cleanup

  // Start P2P chat as initiator
  const startChat = () => {
    if (!receiver || receiver === account) {
      setError('Invalid receiver');
      return;
    }
    if (connected) return;

    console.log('[Chat] ===== INITIATOR SETUP =====');
    console.log('[Chat] Starting as initiator');
    console.log('[Chat] Receiver:', receiver);
    console.log('[Chat] Account:', account);
    setIsInitiator(true);
    setError(null);
    setConnected(false);
    cleanup(true);  // Force clean old

    // Define callbacks
    const onData = (data) => {
      console.log('[Chat] ===== INITIATOR RECEIVED DATA =====');
      console.log('[Chat] Initiator received data:', data);
      if (handleIncomingMessageRef.current) {
        handleIncomingMessageRef.current(data);
      }
    };
    
    const onConnect = () => {
      console.log('[Chat] ===== INITIATOR CONNECTED =====');
      console.log('[Chat] Initiator connected!');
      setConnected(true);
    };
    
    const onError = (err) => {
      console.error('[Chat] ===== INITIATOR ERROR =====');
      console.error('[Chat] Initiator error:', err);
      setError(err.message);
      setConnected(false);
    };
    
    setGlobalCallbacks(onData, onConnect, onError);

    const handleSignal = (signal) => {
      console.log('[Chat] Initiator signal received:', signal.type || 'candidate');
      
      // INITIATOR: Only process answers and candidates, NOT offers
      if (signal.type === 'offer') {
        console.log('[Chat] Initiator ignoring offer signal (meant for responder)');
        return;
      }
      
      if (peerRef.current && !peerRef.current.destroyed) {
        // Check connection state before processing answer
        const signalingState = peerRef.current._pc.signalingState;
        const iceState = peerRef.current._pc.iceConnectionState;
        
        // Don't process answer if already in stable state or connected
        if (signal.type === 'answer' && (signalingState === 'stable' || iceState === 'connected')) {
          console.log('[Chat] Initiator ignoring answer - already in stable/connected state');
          return;
        }
        
        try {
          peerRef.current.signal(signal);
        } catch (err) {
          console.error('[Chat] Error signaling peer:', err);
        }
      }
    };

    setupSignaling(account, handleSignal, receiver);

    peerRef.current = createPeer(
      true,  // Initiator
      account,
      receiver,
      onData,
      onConnect,
      onError
    );
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      localStorage.setItem('lastChatPartner', receiver);
      cleanup(false);  // Non-force cleanup
    };
  }, [receiver]);

  // Send message via P2P
  const handleSendMessage = async () => {
    if (!message.trim()) {
      setError('Message cannot be empty');
      return;
    }

    if (!connected || !peerRef.current) {
      setError('Not connected to peer');
      return;
    }

    try {
      // Check data channel state
      const dataChannel = peerRef.current._channel;
      if (!dataChannel || dataChannel.readyState !== 'open') {
        console.warn('[Chat] Data channel not ready, state:', dataChannel?.readyState);
        throw new Error('Connection not ready. Please wait...');
      }

      // Create a message object with metadata
      const messageObj = {
        text: message,
        timestamp: new Date().toISOString(),
        sender: account,
        type: 'text'
      };

      // Convert to JSON string
      const messageString = JSON.stringify(messageObj);
      console.log('[Chat] Sending message:', messageString);
      
      // Send the message with error handling
      try {
        peerRef.current.send(messageString);
        console.log('[Chat] Message sent successfully');
      } catch (sendError) {
        console.error('[Chat] Error sending message:', sendError);
        throw new Error('Failed to send message: ' + sendError.message);
      }

      // Create message object for UI (optimistic update)
      const newMessage = {
        id: Date.now(),
        content: message,
        text: message,
        sender: account,
        time: new Date(),
        timestamp: new Date().toISOString(),
        incoming: false,
        status: 'sending',
        messageHash: null
      };

      console.log('[Chat] Adding message to UI:', newMessage);
      setMessages(prev => [...prev, newMessage]);
      setMessage(''); // Clear input

      // Store metadata in the background
      try {
        console.log('[Chat] Storing message metadata on chain...');
        const hash = await hashMessage(message);
        await storeMessageMetadata(account, receiver, hash);
        
        console.log('[Chat] Message metadata stored, updating UI');
        // Update message status with the hash
        setMessages(prev => prev.map(msg => 
          msg.id === newMessage.id 
            ? { ...msg, status: 'sent', messageHash: hash } 
            : msg
        ));
      } catch (err) {
        console.error('[Chat] Error storing message metadata:', err);
        // Update message status to show error
        setMessages(prev => prev.map(msg => 
          msg.id === newMessage.id 
            ? { ...msg, status: 'error', error: 'Sent but failed to store on blockchain' } 
            : msg
        ));
      }
    } catch (err) {
      console.error('[Chat] Send error:', err);
      setError('Failed to send message: ' + (err.message || 'Unknown error'));
      
      // Update the last message status if it failed to send
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.sender === account) {
          return [
            ...prev.slice(0, -1),
            { 
              ...lastMsg, 
              status: 'error', 
              error: 'Failed to send',
              timestamp: new Date().toISOString()
            }
          ];
        }
        return prev;
      });
    }
  };

  // Handle enter key press
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !loading && connected) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (loading && messages.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <Box textAlign="center">
          <CircularProgress />
          <Typography variant="body1" mt={2}>Loading messages...</Typography>
        </Box>
      </Box>
    );
  }

  // Get username from localStorage
  const username = localStorage.getItem("username") || "Anonymous";

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          💬 Decentralized Chat
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <AccountCircle color="primary" sx={{ mr: 1 }} />
          <Typography variant="subtitle1">
            <strong>{username}</strong>
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, ml: 4 }}>
          <Typography variant="caption" color="text.secondary">
            <code>{account}</code>
          </Typography>
        </Box>

        {error && (
          <Paper 
            elevation={0} 
            sx={{ 
              backgroundColor: 'error.light', 
              color: 'error.contrastText',
              p: 2, 
              mb: 3,
              borderRadius: 1 
            }}
          >
            {error}
          </Paper>
        )}

        <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
          <Box sx={{ mb: 2 }}>
            <TextField
              label="To (Wallet Address)"
              variant="outlined"
              size="small"
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
              sx={{ width: '100%' }}
              placeholder="Enter recipient's wallet address"
            />
          </Box>

          {/* Connection Status and Start Chat Button */}
          {!connected ? (
            <Button
              variant="contained"
              onClick={startChat}
              disabled={!receiver.trim() || receiver === account || isInitiator}
              sx={{ mb: 2, minWidth: '200px' }}
              color="primary"
            >
              {isInitiator ? 'Connecting...' : 'Start Chat'}
            </Button>
          ) : (
            <Paper 
              sx={{ 
                mb: 2, 
                p: 1.5, 
                backgroundColor: 'success.light',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Typography variant="body1" color="success.dark" fontWeight="bold">
                ✓ Connected - Ready to chat!
              </Typography>
            </Paper>
          )}
          
          {!connected && !isInitiator && receiver.trim() && receiver !== account && (
            <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
              💡 Waiting to receive connection from this address, or click "Start Chat" to initiate
            </Typography>
          )}

          <Box sx={{ mt: 3, display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              multiline
              maxRows={4}
              variant="outlined"
              placeholder="Type your message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={!receiver.trim() || !connected || loading}
              size="small"
            />
            <Button
              variant="contained"
              color="primary"
              onClick={handleSendMessage}
              disabled={!message.trim() || !connected || loading}
              sx={{ minWidth: 100, height: 40, alignSelf: 'flex-end' }}
            >
              {loading ? <CircularProgress size={24} /> : <SendIcon />}
            </Button>
          </Box>
        </Paper>

        <Paper elevation={2} sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Messages</Typography>
            <Tooltip title="Refresh messages">
              <IconButton onClick={loadMessages} disabled={loading} size="small">
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>

          {messages.length > 0 ? (
            <List sx={{ maxHeight: '60vh', overflow: 'auto' }}>
              {messages.map((msg, i) => (
                <React.Fragment key={msg.id || i}>
                  <ListItem 
                    alignItems="flex-start"
                    sx={{
                      bgcolor: msg.incoming ? 'action.hover' : 'background.paper',
                      borderRadius: 1,
                      mb: 1,
                      flexDirection: msg.incoming ? 'row' : 'row-reverse',
                      textAlign: msg.incoming ? 'left' : 'right'
                    }}
                  >
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: msg.incoming ? 'primary.main' : 'secondary.main' }}>
                        {msg.incoming ? 
                          (msg.from ? msg.from.substring(0, 2).toUpperCase() : '?') : 
                          'You'}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Box>
                          <Typography 
                            component="span" 
                            variant="body2" 
                            color="text.secondary"
                            sx={{ display: 'block' }}
                          >
                            {msg.incoming ? 
                              (msg.from ? `${msg.from.substring(0, 6)}...${msg.from.slice(-4)}` : 'Unknown') : 
                              'You'}
                            {' • '}
                            {msg.time ? formatDistanceToNow(getMessageTime(msg)) : 'just now'}
                          </Typography>
                          <Typography variant="body1" sx={{ mt: 0.5, wordBreak: 'break-word' }}>
                            {msg.content || 'Content via P2P (metadata only)'}  {/* Fallback for chain-only */}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Typography
                          component="span"
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            display: 'block',
                            fontFamily: 'monospace',
                            wordBreak: 'break-word',
                            mt: 0.5
                          }}
                        >
                          Hash: {msg.messageHash}
                        </Typography>
                      }
                    />
                  </ListItem>
                  {i < messages.length - 1 && <Divider variant="inset" component="li" />}
                </React.Fragment>
              ))}
            </List>
          ) : (
            <Box sx={{ 
              textAlign: 'center', 
              p: 4, 
              color: 'text.secondary',
              bgcolor: 'background.default',
              borderRadius: 1
            }}>
              <Typography variant="body1" gutterBottom>
                No messages yet
              </Typography>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                All messages are stored on the blockchain (metadata only)
              </Typography>
            </Box>
          )}
        </Paper>
      </Box>
    </Box>
  );
}

export default Chat;