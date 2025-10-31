import React, { useEffect, useState, useCallback, useRef } from "react";

import { 
  initWeb3,
  storeMessageMetadata,
  getMessageMetadata,
  getWeb3,
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

function Chat({ walletAddress }) {
  const [messages, setMessages] = useState([]);
  
  // Helper function to safely create date from message time
  const getMessageTime = (msg) => {
    if (!msg.time) return new Date();
    if (typeof msg.time === 'string') return new Date(msg.time);
    if (msg.time instanceof Date) return msg.time;
    return new Date();
  };
  
  const [receiver, setReceiver] = useState(
    localStorage.getItem('lastChatPartner') || ''
  );
  const [message, setMessage] = useState("");
  const [account, setAccount] = useState(walletAddress);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  const [isInitiator, setIsInitiator] = useState(false);
  const peerRef = useRef(null);

  // Load messages from blockchain
  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Try to load the last 10 messages
      const results = [];
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
        const { account: acc } = await initWeb3();
        if (!mounted) return;
        
        setAccount(acc);
        await loadMessages();
      } catch (err) {
        console.error("❌ Initialization failed:", err);
        setError(`Failed to initialize: ${err.message}`);
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
  }, [loadMessages]);

  // Handle incoming WebRTC messages
  const handleIncomingMessage = useCallback(async (data) => {
    console.log('[Chat] handleIncomingMessage called with:', data);
    
    try {
      let finalText = data;
      
      // If JSON string, extract text
      if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data);
          finalText = parsed.text || parsed.content || data;
          console.log('[Chat] Extracted text from JSON:', finalText);
        } catch (e) {
          console.log('[Chat] Plain string:', data);
        }
      } else if (data && typeof data === 'object') {
        finalText = data.text || data.content || JSON.stringify(data);
      }

      // Placeholder decrypt (skip for now)
      // finalText = await decryptMessage(finalText);

      // Hash & store on chain
      const hash = await hashMessage(finalText);
      await storeMessageMetadata(receiver, account, hash);  // Incoming: receiver as sender

      // Create new message object
      const newMsg = {
        id: Date.now(),
        content: finalText,  // Key: Set actual text here
        text: finalText,     // For backward compatibility
        sender: receiver,    // The other peer is the sender
        time: new Date(),
        timestamp: new Date().toISOString(),
        incoming: true,      // Always true for incoming messages
        messageHash: hash,   // Store the hash for reference
        from: receiver,      // For consistency
        status: 'received',
        type: 'text'
      };

      console.log('[Chat] Adding message to UI:', newMsg);
      
      // Update state
      setMessages(prev => [...prev, newMsg]);
      
      // Save to local storage
      const chatKey = `chat_${account}_${receiver}`;
      const chatHistory = JSON.parse(localStorage.getItem(chatKey) || '[]');
      chatHistory.push(newMsg);
      localStorage.setItem(chatKey, JSON.stringify(chatHistory));

    } catch (err) {
      console.error('[Chat] Error processing incoming message:', err);
      setError('Process failed: ' + (err.message || 'Unknown error'));
    }
  }, [receiver, account]);

  // Auto-start as responder if receiver set (e.g., from URL params)
  useEffect(() => {
    if (receiver && receiver !== account && !isInitiator) {
      console.log('[Chat] Setting up auto-responder for', receiver);
      
      const onConnectHandler = () => {
        console.log('[Chat] ✅ WebRTC connection established!');
        setConnected(true);
      };
      
      const onErrorHandler = (err) => {
        console.error('[Chat] WebRTC error:', err);
        setError('Connection error: ' + (err.message || 'Unknown error'));
        setConnected(false);
      };
      
      setGlobalCallbacks(
        (data) => {
          console.log('[Chat] Received data via global callback');
          handleIncomingMessage(data);
        },
        onConnectHandler,
        onErrorHandler
      );
      
      // Setup signaling for auto-responder
      const handleSignal = (signal) => {
        console.log(`[Chat] Received signal of type: ${signal.type || 'candidate'}`);
        
        if (!peerRef.current) {
          console.log('[Chat] Creating responder peer');
          peerRef.current = createPeer(
            false, // Not initiator
            account,
            receiver,
            (data) => {
              console.log('[Chat] Received data from peer');
              handleIncomingMessage(data);
            },
            onConnectHandler,
            onErrorHandler
          );
        }
        
        if (peerRef.current) {
          if (peerRef.current._pc && peerRef.current._pc.signalingState !== 'stable') {
            console.log(`[Chat] Processing ${signal.type} signal in state:`, peerRef.current._pc.signalingState);
            peerRef.current.signal(signal);
          } else {
            console.log(`[Chat] Queuing signal (${signal.type}) - connection not ready`);
            // Queue the signal if peer isn't ready
            setTimeout(() => peerRef.current?.signal(signal), 500);
          }
        }
      };
      
      setupSignaling(account, handleSignal, receiver);
      
      // Cleanup
      return () => {
        console.log('[Chat] Cleaning up auto-responder');
        if (peerRef.current) {
          peerRef.current.destroy();
          peerRef.current = null;
        }
      };
    }
  }, [receiver, account, isInitiator, handleIncomingMessage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      localStorage.setItem('lastChatPartner', receiver);
      cleanup();  // WebRTC cleanup
    };
  }, [receiver]);

  // Start P2P chat as initiator
  const startChat = () => {
    if (!receiver || receiver === account) {
      setError('Invalid receiver');
      return;
    }
    
    if (peerRef.current) {  // Already connected?
      console.log('[Chat] Using existing peer connection');
      setConnected(true);
      return;
    }
    
    console.log('[Chat] Starting new chat as initiator to', receiver);
    setError(null);
    setConnected(false);
    setIsInitiator(true);
    setIsInitiator(true);  // Only initiator clicks this
    setConnected(false);

    // Set globals for auto-responder fallback
    setGlobalCallbacks(
      (data) => handleIncomingMessage(data),
      () => setConnected(true),
      (err) => { setError(err.message); setConnected(false); }
    );

    // Setup signaling (handles auto-responder if offer arrives first)
    setupSignaling(account, (signal) => {
      // State guard: Only signal if appropriate
      if (!peerRef.current || peerRef.current._pc.signalingState === 'stable') {
        console.log('[Chat] Skipping signal in stable state');
        return;
      }
      peerRef.current.signal(signal);
    }, receiver);  // Pass remote for auto-create

    // Manual create as initiator
    peerRef.current = createPeer(
      true,  // Initiator
      account,
      receiver,
      (data) => handleIncomingMessage(data),
      () => setConnected(true),
      (err) => { setError(err.message); setConnected(false); }
    );
  };


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
      // Create a message object with metadata
      const messageObj = {
        text: message,
        timestamp: new Date().toISOString(),
        sender: account,
        type: 'text'
      };

      // Convert to JSON string and send
      const messageString = JSON.stringify(messageObj);
      console.log('[Chat] Sending message:', messageString);
      
      // Send the message
      peerRef.current.send(messageString);

      // Add to UI immediately (optimistic update)
      const newMessage = {
        id: Date.now(),
        content: message,
        text: message,
        sender: account,
        time: new Date(),
        timestamp: new Date().toISOString(),
        incoming: false,
        status: 'sending'
      };

      setMessages(prev => [...prev, newMessage]);
      setMessage(''); // Clear input

      // Store metadata in the background
      try {
        const hash = await hashMessage(message);
        await storeMessageMetadata(account, receiver, hash);
        
        // Update message status
        setMessages(prev => prev.map(msg => 
          msg.id === newMessage.id 
            ? { ...msg, status: 'sent', hash } 
            : msg
        ));
      } catch (err) {
        console.error('Error storing message metadata:', err);
        // Update message status to show error
        setMessages(prev => prev.map(msg => 
          msg.id === newMessage.id 
            ? { ...msg, status: 'error', error: 'Failed to store on blockchain' } 
            : msg
        ));
      }
    } catch (err) {
      console.error('Send error:', err);
      setError('Failed to send message: ' + (err.message || 'Unknown error'));
      
      // Update the last message status if it failed to send
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.sender === account) {
          return [
            ...prev.slice(0, -1),
            { ...lastMsg, status: 'error', error: 'Failed to send' }
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

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          💬 Decentralized Chat
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <AccountCircle color="primary" sx={{ mr: 1 }} />
          <Typography variant="subtitle1">
            Connected as: <code>{account}</code>
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

          {/* NEW: Start Chat Button */}
          <Button
            variant="outlined"
            onClick={startChat}
            disabled={!receiver.trim() || (connected && isInitiator) || (receiver === account)}
            sx={{ mb: 2, minWidth: '200px' }}
          >
            {connected 
              ? 'Connected' 
              : isInitiator 
                ? 'Start Chat (Initiator)' 
                : 'Ready to Receive Connection'
            }
          </Button>

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