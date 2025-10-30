import React, { useEffect, useState, useCallback } from "react";
import { 
  initWeb3,
  storeMessageMetadata,
  getMessageMetadata,
  getWeb3
} from "../utils/blockchain";
import { createPeerConnection, closeAllConnections } from "../utils/webrtcNew";
import { encryptMessage, decryptMessage } from "../utils/encryption";
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

function Chat({ walletAddress }) {
  const [messages, setMessages] = useState([]);
  const [receiver, setReceiver] = useState(
    localStorage.getItem('lastChatPartner') || ''
  );
  const [message, setMessage] = useState("");
  const [account, setAccount] = useState(walletAddress);
  const [peer, setPeer] = useState(null);
  const [ws, setWs] = useState(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isInitiator, setIsInitiator] = useState(false);
  const [connection, setConnection] = useState(null);

  // Load messages from blockchain
  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const messagePromises = [];
      // Load last 20 messages for better history
      for (let i = 0; i < 20; i++) {
        messagePromises.push(
          getMessageMetadata(i)
            .then((metadata) => {
              if (metadata && metadata.messageHash) {
                return { 
                  ...metadata, 
                  id: i,
                  time: new Date(parseInt(metadata.timestamp) * 1000),
                  incoming: metadata.sender.toLowerCase() !== account.toLowerCase()
                };
              }
              return null;
            })
            .catch((e) => {
              if (!e.message.includes("not found")) console.warn(e);
              return null;
            })
        );
      }
      
      const loaded = await Promise.all(messagePromises);
      const validMessages = loaded.filter(Boolean);
      
      // Sort messages by timestamp
      validMessages.sort((a, b) => a.time - b.time);
      
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
    let currentPeer = peer;
    
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
      if (currentPeer) {
        currentPeer.destroy();
      }
    };
  }, [loadMessages, peer]);

  useEffect(() => {
    return () => {
      if (connection) {
        connection.close();
      }
      if (ws) {
        ws.close();
      }
      closeAllConnections();
    };
  }, [connection, ws]);

  useEffect(() => {
    if (!account || !receiver) return;

    const wsUrl = `ws://localhost:8000/ws/${account}`;
    const wsClient = new WebSocket(wsUrl);

    wsClient.onopen = () => {
      console.log('WebSocket connected');
      setWs(wsClient);
    };

    wsClient.onmessage = (event) => {
      try {
        const signal = JSON.parse(event.data);
        console.log('WebSocket signal received:', signal);
        
        if (connection) {
          connection.handleSignal(signal);
        } else if (signal.type === 'offer') {
          // If we receive an offer but don't have a connection yet, create one
          startChat(false);
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    };

    wsClient.onclose = () => {
      console.log('WebSocket disconnected');
      setWs(null);
      setConnected(false);
    };

    wsClient.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('WebSocket connection error');
    };

    return () => {
      wsClient.close();
    };
  }, [account, receiver, connection]);

  // Setup peer connection for real-time chat
  const startChat = async (initiator = true) => {
    if (!receiver.trim()) {
      setError("Please enter a valid wallet address");
      return;
    }
    
    try {
      setIsInitiator(initiator);
      console.log('Starting chat with:', { receiver, account, initiator });
      
      // Close existing connection if any
      if (connection) {
        connection.close();
      }
      setIsConnecting(true);
      setError(null);
      setConnected(false);
      
      // Save last chat partner
      localStorage.setItem('lastChatPartner', receiver);
      
      // Initialize Web3 if not already done
      if (!window.ethereum) {
        console.log('Initializing Web3...');
        await initWeb3();
      }
      
      // Close any existing connection
      if (peer) {
        console.log('Cleaning up existing peer connection...');
        try {
          peer.destroy();
          setPeer(null);
        } catch (err) {
          console.warn('Error cleaning up previous connection:', err);
        }
      }
      
      // Close any existing WebSocket connection
      if (ws) {
        console.log('Closing existing WebSocket connection...');
        try {
          ws.close();
          setWs(null);
        } catch (err) {
          console.warn('Error closing WebSocket:', err);
        }
      }
      
      console.log('Creating new peer connection...');
      
      // Create a new connection using the new WebRTC implementation
      const newConnection = createPeerConnection({
        localAddr: account,
        remoteAddr: receiver,
        initiator,
        onSignal: (signal) => {
          console.log('Sending signal:', signal.type);
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              ...signal,
              to: receiver,
              from: account
            }));
          }
        },
        onConnect: () => {
          console.log('✅ Peer connection established');
          setConnected(true);
          setIsConnecting(false);
          setError(null);
        },
        onData: async (data) => {
          try {
            // Handle incoming messages
            const message = JSON.parse(data);
            if (message && message.content) {
              const decrypted = await decryptMessage(message.content, account);
              setMessages(prev => [...prev, {
                id: Date.now(),
                content: decrypted,
                sender: message.sender,
                time: new Date(),
                incoming: true
              }]);
            }
          } catch (error) {
            console.error('Error handling incoming message:', error);
          }
        },
        onClose: () => {
          console.log('Peer connection closed');
          setConnected(false);
          setConnection(null);
          setError('Connection closed. Click start to reconnect.');
        },
        onError: (error) => {
          console.error('Peer connection error:', error);
          setError('Connection error: ' + (error.message || 'Unknown error'));
          setConnected(false);
          setIsConnecting(false);
        }
      });
      
      setConnection(newConnection);
      setPeer(newConnection.pc); // Keep for backward compatibility
      setIsConnecting(true);
          ws.close();
          setWs(null);
        }
        return; // Exit early on error
      }
      
    } catch (error) {
      console.error('Error in startChat:', error);
      setError(`Connection error: ${error.message}`);
      setIsConnecting(false);
      setConnected(false);
    }
  };

  // Handle incoming P2P messages (kept for backward compatibility)
  const handleIncoming = async (encryptedMsg) => {
    try {
      if (!encryptedMsg) {
        console.warn('Received empty message');
        return;
      }
      
      const web3 = getWeb3();
      const messageHash = web3.utils.sha3(encryptedMsg);
      let decryptedMsg;
      
      try {
        decryptedMsg = await decryptMessage(encryptedMsg, account);
      } catch (decryptErr) {
        console.error('❌ Decryption error:', decryptErr);
        setError('Failed to decrypt message');
        return;
      }
      const timestamp = Math.floor(Date.now() / 1000);
      
      const newMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        receiver: account,
        messageHash,
        from: receiver,
        text: decryptedMsg,
        incoming: true,
        time: new Date(),
        timestamp
      };
      
      // Store message metadata on-chain
      // Create message object
      const newMessage = {
        id: Date.now(),
        content: decryptedMsg,
        sender: receiver,
        time: new Date(),
        incoming: true,
        messageHash
      };

      try {
        await storeMessageMetadata(receiver, account, messageHash);
      } catch (storeErr) {
        console.error('❌ Failed to store message on-chain:', storeErr);
        // Continue with UI update even if blockchain storage fails
      }
      
      setMessages(prev => {
        // Avoid duplicates
        if (!prev.some(m => m.messageHash === messageHash)) {
          return [...prev, newMessage];
        }
        return prev;
      });
      
    } catch (err) {
      console.error("❌ Error processing incoming message:", err);
      setError(`Failed to process message: ${err.message}`);
    }
  };

  // Send message via WebRTC and store hash on-chain
  const handleSendMessage = async () => {
    if (!message.trim() || !connected || !connection) return;

    // Create a temporary message for optimistic UI update
    const tempMessage = {
      id: Date.now(),
      content: message,
      sender: account,
      time: new Date(),
      incoming: false,
      isSending: true
    };

    try {
      // Update UI immediately with temporary message
      setMessages(prev => [...prev, tempMessage]);
      
      // Encrypt the message
      const encrypted = await encryptMessage(message, receiver);
      const messageObj = {
        content: encrypted,
        sender: account,
        timestamp: Math.floor(Date.now() / 1000)
      };

      // Send through WebRTC
      const success = connection.send(JSON.stringify(messageObj));
      
      if (!success) {
        throw new Error('Failed to send message: Data channel not ready');
      }

      // Store message metadata on blockchain
      const web3 = getWeb3();
      const messageHash = web3.utils.sha3(encrypted);
      
      try {
        await storeMessageMetadata(
          receiver,  // to
          account,   // from
          messageHash,
          messageObj.timestamp
        );

        // Update message status to sent
        setMessages(prev => 
          prev.map(m => 
            m.id === tempMessage.id 
              ? { ...m, isSending: false, messageHash }
              : m
          )
        );
        
        setMessage('');
      } catch (err) {
        console.error('❌ Failed to store message on blockchain:', err);
        // Keep the message but mark as failed
        setMessages(prev => 
          prev.map(m => 
            m.id === tempMessage.id 
              ? { 
                  ...m, 
                  isSending: false, 
                  error: 'Failed to store on blockchain' 
                }
              : m
          )
        );
        setError('Message sent but failed to store on blockchain: ' + err.message);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setError('Failed to send message: ' + error.message);
      
      // Remove the failed message from the UI
      setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
    }
    } finally {
      setLoading(false);
    }
  };
  
  // Format timestamp to relative time (e.g., "2 minutes ago")
  const formatTime = (date) => {
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true });
    } catch (e) {
      return '';
    }
  };
  
  // Handle enter key press
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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
              fullWidth
              label="Recipient's Wallet Address"
              variant="standard"
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
              disabled={connected}
              size="small"
              placeholder="0x..."
            />
          </Box>

          {!connected ? (
            <Button
              variant="contained"
              color="primary"
              onClick={startChat}
              disabled={!receiver.trim() || isConnecting}
              startIcon={isConnecting ? <CircularProgress size={20} /> : null}
            >
              {isConnecting ? 'Connecting...' : 'Start Chat'}
            </Button>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', color: 'success.main', mb: 2 }}>
              <Box sx={{ width: 8, height: 8, bgcolor: 'success.main', borderRadius: '50%', mr: 1 }} />
              <Typography variant="body2">Connected to peer</Typography>
            </Box>
          )}

          <Box sx={{ mt: 3, display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              multiline
              maxRows={4}
              variant="standard"
              placeholder="Type your message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={!connected || loading}
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
                            {formatTime(msg.time)}
                          </Typography>
                          <Typography variant="body1" sx={{ mt: 0.5, wordBreak: 'break-word' }}>
                            {msg.text}
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
              <Typography variant="body2">
                {connected ? 
                  'Send a message to start the conversation!' : 
                  'Connect to a peer to start chatting'}
              </Typography>
            </Box>
          )}
        </Paper>
      </Box>
    </Box>
  );
}

export default Chat;
