import React, { useEffect, useState, useCallback } from "react";
import { 
  initWeb3,
  storeMessageMetadata,
  getMessageMetadata,
  getWeb3
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
                time: new Date()
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

  useEffect(() => {
    return () => {
      localStorage.setItem('lastChatPartner', receiver);
    };
  }, [receiver]);

  // Send message via blockchain
  const handleSendMessage = async () => {
    if (!message.trim() || !receiver.trim()) return;

    try {
      // Store message metadata on blockchain
      const web3 = getWeb3();
      const messageHash = web3.utils.sha3(message);
      
      await storeMessageMetadata(
        receiver,  // to
        account,   // from
        messageHash
      );

      // Update UI with new message
      setMessages(prev => [...prev, {
        id: Date.now(),
        content: message,
        sender: account,
        time: new Date(),
        incoming: false
      }]);
      
      setMessage('');
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to send message: ' + err.message);
    }
  };

  // Handle enter key press
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !loading) {
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
              disabled={!receiver.trim() || loading}
              size="small"
            />
            <Button
              variant="contained"
              color="primary"
              onClick={handleSendMessage}
              disabled={!message.trim() || !receiver.trim() || loading}
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
                            {msg.time ? formatDistanceToNow(new Date(msg.time)) : 'just now'}
                          </Typography>
                          <Typography variant="body1" sx={{ mt: 0.5, wordBreak: 'break-word' }}>
                            {msg.content}
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
                All messages are stored on the blockchain
              </Typography>
            </Box>
          )}
        </Paper>
      </Box>
    </Box>
  );
}

export default Chat;
