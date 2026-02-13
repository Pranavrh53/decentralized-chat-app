import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { createTheme, ThemeProvider } from '@mui/material/styles';

import { 
  initWeb3,
  storeMessageMetadata,
  getMessageMetadata,
  hashMessage,
  loadChatHistory
} from "../utils/blockchain";
import { uploadToIPFS, retrieveFromIPFS } from "../utils/ipfs";
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
import { Send as SendIcon, AccountCircle, Refresh as RefreshIcon, ArrowBack as ArrowBackIcon, AttachFile as AttachFileIcon, Close as CloseIcon } from "@mui/icons-material";
import { formatDistanceToNow } from 'date-fns';
import { createPeer, setupSignaling, cleanup, setGlobalCallbacks } from "../utils/webrtc";
import { sendFile, FileReceiver, validateFile, getFileIcon, formatFileSize } from "../utils/fileTransfer";

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
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [friendName, setFriendName] = useState('');
  
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
  
  // File transfer state
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const fileReceiverRef = useRef(null);
  const fileInputRef = useRef(null);

  // Update receiver when friendAddress from URL changes
  useEffect(() => {
    if (friendAddress && friendAddress !== receiver) {
      // Ensure friendAddress is a string
      const addressString = typeof friendAddress === 'string' ? friendAddress : friendAddress.address || friendAddress;
      setReceiver(addressString);
      localStorage.setItem('lastChatPartner', addressString);
      
      // Get friend's name from friends list
      const friendsList = JSON.parse(localStorage.getItem(`friends_${walletAddress}`) || '[]');
      const friend = friendsList.find(f => f.address && f.address.toLowerCase() === addressString.toLowerCase());
      if (friend) {
        setFriendName(friend.name);
      } else {
        setFriendName('');
      }
    }
  }, [friendAddress, receiver, walletAddress]);

  // Initialize FileReceiver
  useEffect(() => {
    fileReceiverRef.current = new FileReceiver((file, fileUrl) => {
      // Callback when file is fully received
      console.log('[Chat] File received:', file.name, fileUrl);
      
      const newMsg = {
        id: Date.now(),
        content: file.name,
        sender: receiver,
        time: new Date(),
        timestamp: new Date().toISOString(),
        incoming: true,
        from: receiver,
        type: 'file',
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        fileUrl: fileUrl
      };
      
      setMessages(prev => {
        const updated = [...prev, newMsg];
        // Save to localStorage
        const normalizedAccount = account?.toLowerCase();
        const normalizedReceiver = receiver?.toLowerCase();
        if (normalizedAccount && normalizedReceiver) {
          const chatKey = `chat_${normalizedAccount}_${normalizedReceiver}`;
          // Don't save fileUrl to localStorage (it's a blob URL that expires)
          const msgToSave = { ...newMsg, fileUrl: null };
          localStorage.setItem(chatKey, JSON.stringify([...prev.filter(m => m.type !== 'file' || m.fileUrl), msgToSave]));
        }
        return updated;
      });
      
      setDownloading(false);
    });
    
    return () => {
      // Cleanup on unmount
      if (fileReceiverRef.current) {
        fileReceiverRef.current = null;
      }
    };
  }, [account, receiver]);

  // Load messages from blockchain and IPFS
  const loadMessages = useCallback(async () => {
    if (!account || !receiver) {
      console.log('⚠️ Waiting for account and receiver...');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Normalize addresses to lowercase for consistent localStorage keys
      const normalizedAccount = account.toLowerCase();
      const normalizedReceiver = receiver.toLowerCase();
      
      // STEP 1: Load messages from localStorage first (imported or cached messages)
      const chatKey = `chat_${normalizedAccount}_${normalizedReceiver}`;
      const localMessages = JSON.parse(localStorage.getItem(chatKey) || '[]');
      
      if (localMessages.length > 0) {
        console.log(`📦 Found ${localMessages.length} messages in localStorage for key: ${chatKey}`);
        setMessages(localMessages);
      }
      
      // STEP 2: Load messages from blockchain + IPFS
      console.log('📜 Loading chat history from blockchain...');
      const chatHistory = await loadChatHistory(account, receiver);
      
      console.log(`✅ Found ${chatHistory.length} messages in blockchain`);
      
      if (chatHistory.length === 0) {
        // Keep localStorage messages if blockchain is empty
        if (localMessages.length === 0) {
          setMessages([]);
        }
        return;
      }
      
      // Load message content from IPFS
      const messagesWithContent = await Promise.all(
        chatHistory.map(async (msg) => {
          try {
            // If there's an IPFS hash, retrieve the content
            if (msg.ipfsHash) {
              console.log(`🔄 Fetching message ${msg.id} from IPFS:`, msg.ipfsHash);
              const ipfsData = await retrieveFromIPFS(msg.ipfsHash);
              
              return {
                ...msg,
                content: ipfsData.content || '',
                text: ipfsData.content || '',
                time: new Date(msg.timestamp * 1000),
                incoming: msg.sender.toLowerCase() !== account.toLowerCase(),
                status: 'delivered'
              };
            } else {
              // Old message without IPFS hash
              return {
                ...msg,
                content: '(Message content not available)',
                text: '(Message content not available)',
                time: new Date(msg.timestamp * 1000),
                incoming: msg.sender.toLowerCase() !== account.toLowerCase(),
                status: 'delivered'
              };
            }
          } catch (error) {
            console.warn(`Failed to load content for message ${msg.id}:`, error);
            return {
              ...msg,
              content: '(Failed to load from IPFS)',
              text: '(Failed to load from IPFS)',
              time: new Date(msg.timestamp * 1000),
              incoming: msg.sender.toLowerCase() !== account.toLowerCase(),
              status: 'error'
            };
          }
        })
      );
      
      // STEP 3: Merge localStorage and blockchain messages (deduplicate)
      const mergedMessages = [...localMessages];
      
      messagesWithContent.forEach(blockchainMsg => {
        const exists = mergedMessages.some(local => 
          local.id === blockchainMsg.id || 
          (local.text === blockchainMsg.content && 
           Math.abs(new Date(local.time).getTime() - new Date(blockchainMsg.time).getTime()) < 5000)
        );
        
        if (!exists) {
          mergedMessages.push(blockchainMsg);
        }
      });
      
      // Sort by time
      mergedMessages.sort((a, b) => {
        const timeA = a.time instanceof Date ? a.time : new Date(a.time);
        const timeB = b.time instanceof Date ? b.time : new Date(b.time);
        return timeA - timeB;
      });
      
      console.log(`✅ Total messages after merge: ${mergedMessages.length}`);
      setMessages(mergedMessages);
      
      // Update localStorage with merged messages (using variables already declared above)
      localStorage.setItem(chatKey, JSON.stringify(mergedMessages));
      
    } catch (err) {
      console.error("❌ Error loading messages:", err);
      setError(`Failed to load messages: ${err.message}`);
      
      // Even on error, try to show localStorage messages with normalized addresses
      const normalizedAccount = account.toLowerCase();
      const normalizedReceiver = receiver.toLowerCase();
      const chatKey = `chat_${normalizedAccount}_${normalizedReceiver}`;
      const localMessages = JSON.parse(localStorage.getItem(chatKey) || '[]');
      if (localMessages.length > 0) {
        setMessages(localMessages);
      }
    } finally {
      setLoading(false);
    }
  }, [account, receiver]);

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

  // Reload messages when receiver changes
  useEffect(() => {
    if (account && receiver) {
      console.log(`🔄 Loading messages for conversation with ${receiver}`);
      loadMessages();
    }
  }, [account, receiver, loadMessages]);

  // Save messages to localStorage whenever they change (for sent messages)
  useEffect(() => {
    if (account && receiver && messages.length > 0) {
      const normalizedAccount = account.toLowerCase();
      const normalizedReceiver = receiver.toLowerCase();
      const chatKey = `chat_${normalizedAccount}_${normalizedReceiver}`;
      localStorage.setItem(chatKey, JSON.stringify(messages));
    }
  }, [messages, account, receiver]);

  // Handle incoming WebRTC messages
  const handleIncomingMessage = useCallback(async (data) => {
    console.log('[Chat] Raw incoming data:', data);
    
    try {
      // Check if it's file transfer data
      if (fileReceiverRef.current) {
        const handled = fileReceiverRef.current.handleData(data);
        if (handled) {
          return; // File transfer data, don't process as text message
        }
      }
      
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
        // Handle binary data (file chunks handled above by FileReceiver)
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
      
      // Save to local storage with normalized addresses
      const normalizedAccount = account.toLowerCase();
      const normalizedReceiver = receiver.toLowerCase();
      const chatKey = `chat_${normalizedAccount}_${normalizedReceiver}`;
      const chatHistory = JSON.parse(localStorage.getItem(chatKey) || '[]');
      chatHistory.push(newMsg);
      localStorage.setItem(chatKey, JSON.stringify(chatHistory));
      console.log('[Chat] Message saved to local storage with key:', chatKey);
      
      // Receiver does NOT store metadata on blockchain - only sender does
      // This avoids the receiver needing to approve a transaction

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
        if (peerRef.current && !peerRef.current.destroyed && peerRef.current._pc) {
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

  // Auto-connect when component loads if receiver is set
  useEffect(() => {
    if (receiver && account && receiver !== account && !connected && !isInitiator) {
      // Small delay to ensure setup is complete
      const timer = setTimeout(() => {
        console.log('[Chat] Auto-starting chat with receiver:', receiver);
        startChat();
      }, 500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiver, account]);

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
      
      if (peerRef.current && !peerRef.current.destroyed && peerRef.current._pc) {
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

      // STEP 1: Upload message to IPFS first
      console.log('[Chat] 📤 Uploading message to IPFS...');
      const ipfsHash = await uploadToIPFS(message, {
        sender: account,
        receiver: receiver,
        timestamp: new Date().toISOString()
      });
      console.log('[Chat] ✅ IPFS upload successful:', ipfsHash);

      // STEP 2: Store metadata on blockchain (requires transaction approval)
      console.log('[Chat] 📝 Storing message metadata on blockchain...');
      const hash = await hashMessage(message);
      await storeMessageMetadata(account, receiver, hash, ipfsHash);
      console.log('[Chat] ✅ Blockchain transaction approved!');

      // STEP 3: Send the message via WebRTC for real-time delivery
      const messageObj = {
        text: message,
        timestamp: new Date().toISOString(),
        sender: account,
        type: 'text',
        ipfsHash: ipfsHash
      };

      const messageString = JSON.stringify(messageObj);
      console.log('[Chat] 📨 Sending message via WebRTC:', messageString);
      
      try {
        peerRef.current.send(messageString);
        console.log('[Chat] ✅ Message sent successfully');
      } catch (sendError) {
        console.error('[Chat] Error sending message:', sendError);
        throw new Error('Failed to send message: ' + sendError.message);
      }

      // Create message object for UI
      const newMessage = {
        id: Date.now(),
        content: message,
        text: message,
        sender: account,
        time: new Date(),
        timestamp: new Date().toISOString(),
        incoming: false,
        status: 'sent',
        messageHash: hash,
        ipfsHash: ipfsHash
      };

      console.log('[Chat] Adding message to UI:', newMessage);
      setMessages(prev => [...prev, newMessage]);
      setMessage(''); // Clear input
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

  // Handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const validation = validateFile(file);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }
    
    setSelectedFile(file);
    setError(null);
  };

  // Handle file send
  const handleSendFile = async () => {
    if (!selectedFile) return;
    
    if (!connected || !peerRef.current) {
      setError('Not connected to peer');
      return;
    }

    try {
      setUploadProgress(0);
      
      // Send file via WebRTC
      await sendFile(selectedFile, peerRef.current, (progress) => {
        setUploadProgress(progress);
      });

      // Create file URL for local display
      const fileUrl = URL.createObjectURL(selectedFile);

      // Add to messages
      const newMsg = {
        id: Date.now(),
        content: selectedFile.name,
        sender: account,
        time: new Date(),
        timestamp: new Date().toISOString(),
        incoming: false,
        from: account,
        type: 'file',
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        fileType: selectedFile.type,
        fileUrl: fileUrl,
        status: 'sent'
      };

      setMessages(prev => {
        const updated = [...prev, newMsg];
        // Save to localStorage (without fileUrl since it's temporary)
        const normalizedAccount = account.toLowerCase();
        const normalizedReceiver = receiver.toLowerCase();
        const chatKey = `chat_${normalizedAccount}_${normalizedReceiver}`;
        const msgToSave = { ...newMsg, fileUrl: null };
        localStorage.setItem(chatKey, JSON.stringify([...prev, msgToSave]));
        return updated;
      });

      // Clear selection
      setSelectedFile(null);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('[Chat] File send error:', err);
      setError('Failed to send file: ' + err.message);
      setUploadProgress(0);
    }
  };

  // Clear selected file
  const handleClearFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <IconButton 
            onClick={() => navigate('/friends')} 
            sx={{ mr: 2, color: 'primary.main' }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4" component="h1">
            💬 Chat {friendName && `with ${friendName}`}
          </Typography>
        </Box>
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
        {receiver && (
          <Box sx={{ mb: 2, p: 2, backgroundColor: 'rgba(138, 102, 255, 0.1)', borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Chatting with: <strong>{friendName || 'Unknown'}</strong>
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
              {receiver}
            </Typography>
          </Box>
        )}

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
          {/* Connection Status */}
          {!connected ? (
            <Paper 
              sx={{ 
                mb: 2, 
                p: 1.5, 
                backgroundColor: 'rgba(138, 102, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Typography variant="body1" color="primary" fontWeight="bold">
                ⏳ Connecting...
              </Typography>
            </Paper>
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

          {/* Selected file preview */}
          {selectedFile && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {getFileIcon(selectedFile.type)}
                <Box>
                  <Typography variant="body2">{selectedFile.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{formatFileSize(selectedFile.size)}</Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {uploadProgress > 0 && uploadProgress < 100 && (
                  <CircularProgress variant="determinate" value={uploadProgress} size={24} />
                )}
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleSendFile}
                  disabled={uploadProgress > 0}
                >
                  Send
                </Button>
                <IconButton size="small" onClick={handleClearFile} disabled={uploadProgress > 0}>
                  <CloseIcon />
                </IconButton>
              </Box>
            </Box>
          )}

          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

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
            <Tooltip title="Attach file">
              <span>
                <IconButton
                  color="primary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!receiver.trim() || !connected || loading || selectedFile !== null}
                  sx={{ alignSelf: 'flex-end', height: 40 }}
                >
                  <AttachFileIcon />
                </IconButton>
              </span>
            </Tooltip>
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
                          
                          {/* File display */}
                          {msg.type === 'file' ? (
                            <Box sx={{ mt: 1 }}>
                              {msg.fileType?.startsWith('image/') && msg.fileUrl ? (
                                <Box
                                  component="img"
                                  src={msg.fileUrl}
                                  alt={msg.fileName}
                                  sx={{
                                    maxWidth: '300px',
                                    maxHeight: '300px',
                                    borderRadius: 1,
                                    cursor: 'pointer'
                                  }}
                                  onClick={() => window.open(msg.fileUrl, '_blank')}
                                />
                              ) : (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                                  {getFileIcon(msg.fileType)}
                                  <Box sx={{ flex: 1 }}>
                                    <Typography variant="body2">{msg.fileName}</Typography>
                                    {msg.fileSize && (
                                      <Typography variant="caption" color="text.secondary">
                                        {formatFileSize(msg.fileSize)}
                                      </Typography>
                                    )}
                                  </Box>
                                  {msg.fileUrl && (
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      href={msg.fileUrl}
                                      download={msg.fileName}
                                    >
                                      Download
                                    </Button>
                                  )}
                                </Box>
                              )}
                            </Box>
                          ) : (
                            <Typography variant="body1" sx={{ mt: 0.5, wordBreak: 'break-word' }}>
                              {msg.content || 'Content via P2P (metadata only)'}
                            </Typography>
                          )}
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