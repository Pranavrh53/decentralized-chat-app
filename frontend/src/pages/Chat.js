import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";

import { 
  initWeb3,
  storeMessageMetadata,
  getMessageMetadata,
  hashMessage,
  loadChatHistory
} from "../utils/blockchain";
import { uploadToIPFS, retrieveFromIPFS } from "../utils/ipfs";
import { getChatKey, getFriendsKey } from "../utils/storageHelper";
import { saveMessage, loadMessagesFromAllSources } from "../utils/messageStore";
import { 
  Box, 
  TextField, 
  Button, 
  Typography, 
  Paper, 
  List, 
  ListItem, 
  ListItemText, 
  ListItemAvatar,
  Divider,
  IconButton,
  Tooltip,
  CircularProgress
} from "@mui/material";
import { Send as SendIcon, Refresh as RefreshIcon, ArrowBack as ArrowBackIcon, AttachFile as AttachFileIcon, Close as CloseIcon } from "@mui/icons-material";
import { formatDistanceToNow } from 'date-fns';
import { createPeer, setupSignaling, cleanup, setGlobalCallbacks } from "../utils/webrtc";
import { sendFile, FileReceiver, validateFile, getFileIcon, formatFileSize } from "../utils/fileTransfer";
import AvatarAnimated3D from "../components/AvatarAnimated3D";

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
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  
  // File transfer state
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const fileReceiverRef = useRef(null);
  const fileInputRef = useRef(null);
  
  // Add polling for messages when P2P connection fails
  const pollingIntervalRef = useRef(null);

  // Update receiver when friendAddress from URL changes
  useEffect(() => {
    if (friendAddress && friendAddress !== receiver) {
      // Ensure friendAddress is a string
      const addressString = typeof friendAddress === 'string' ? friendAddress : friendAddress.address || friendAddress;
      setReceiver(addressString);
      localStorage.setItem('lastChatPartner', addressString);
      
      // Get friend's name from friends list (always use normalized key)
      const friendsKey = getFriendsKey(walletAddress);
      const friendsList = JSON.parse(localStorage.getItem(friendsKey) || '[]');
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
        // Save to localStorage + server
        if (account && receiver) {
          const msgToSave = { ...newMsg, fileUrl: null };
          saveMessage(account, receiver, msgToSave);
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

  // Load messages strictly from blockchain + IPFS (source of truth)
  const loadMessages = useCallback(async () => {
    if (!account || !receiver) {
      console.log('⚠️ Waiting for account and receiver...');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('📜 Loading chat history from blockchain (strict mode)...');
      const chatHistory = await loadChatHistory(account, receiver);

      if (chatHistory.length === 0) {
        console.log('ℹ️ No on-chain messages found for this pair.');
        setMessages([]);
      } else {
        console.log(`✅ Found ${chatHistory.length} messages on-chain, resolving IPFS...`);

        const messagesWithContent = await Promise.all(
          chatHistory.map(async (msg) => {
            try {
              if (msg.ipfsHash) {
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
              return null;
            }
          })
        );

        const validBlockchainMsgs = messagesWithContent.filter(Boolean);
        validBlockchainMsgs.sort(
          (a, b) => new Date(a.time || a.timestamp) - new Date(b.time || b.timestamp)
        );

        setMessages(validBlockchainMsgs);

        // Optional local cache for faster subsequent loads (safe to clear)
        const chatKey = getChatKey(account, receiver);
        localStorage.setItem(chatKey, JSON.stringify(validBlockchainMsgs));
      }
    } catch (err) {
      console.error("❌ Error loading messages:", err);
      setError(`Failed to load messages: ${err.message}`);
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
          // Still load messages from GunDB + server (skip blockchain only)
          await loadMessages();
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

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (account && receiver && messages.length > 0) {
      const chatKey = getChatKey(account, receiver);
      localStorage.setItem(chatKey, JSON.stringify(messages));
    }
  }, [messages, account, receiver]);

  // Polling mechanism: When P2P connection fails, poll blockchain for new messages
  useEffect(() => {
    // Clear any existing polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    // If not connected and we have account & receiver, start polling
    if (!connected && account && receiver && !loading) {
      console.log('📡 Starting blockchain polling (P2P not connected)');
      
      // Poll every 5 seconds
      pollingIntervalRef.current = setInterval(() => {
        console.log('🔄 Polling blockchain for new messages...');
        loadMessages();
      }, 5000);
    }

    // Cleanup
    return () => {
      if (pollingIntervalRef.current) {
        console.log('📡 Stopping blockchain polling');
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [connected, account, receiver, loading, loadMessages]);

  // Auto-retry connection mechanism
  useEffect(() => {
    if (!connected && account && receiver && connectionAttempts < 3 && !isRetrying) {
      const timer = setTimeout(() => {
        console.log(`🔄 Connection attempt ${connectionAttempts + 1}/3`);
        setIsRetrying(true);
        setConnectionAttempts(prev => prev + 1);
        startChat();
        setTimeout(() => setIsRetrying(false), 2000);
      }, 3000 * (connectionAttempts + 1)); // Exponential backoff
      
      return () => clearTimeout(timer);
    }
  }, [connected, account, receiver, connectionAttempts, isRetrying]);

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
      
      // Save to server + localStorage
      saveMessage(account, receiver, newMsg);
      console.log('[Chat] Message saved to server + localStorage');
      
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

    try {
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

      // STEP 3: Send the message via WebRTC for real-time delivery (if connected)
      if (connected && peerRef.current) {
        const dataChannel = peerRef.current._channel;
        if (dataChannel && dataChannel.readyState === 'open') {
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
            console.log('[Chat] ✅ Message sent via P2P');
          } catch (sendError) {
            console.warn('[Chat] WebRTC send failed, message saved to blockchain:', sendError);
          }
        } else {
          console.log('[Chat] ⚠️ WebRTC channel not ready, message saved to blockchain');
        }
      } else {
        console.log('[Chat] ⚠️ Not connected via P2P, message saved to blockchain only');
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
      
      // Save to server for persistence
      saveMessage(account, receiver, newMessage);
      
      // If not connected, trigger a reload after a delay to show the message appeared
      if (!connected) {
        setTimeout(() => {
          console.log('[Chat] Reloading to verify message on blockchain...');
          loadMessages();
        }, 2000);
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
    if (e.key === 'Enter' && !e.shiftKey && !loading) {
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
        // Save to server + localStorage (without fileUrl since it's temporary)
        const msgToSave = { ...newMsg, fileUrl: null };
        saveMessage(account, receiver, msgToSave);
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

  const shellStyles = {
    page: {
      minHeight: '100vh',
      background: '#000000',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      padding: '96px 24px 40px'
    },
    card: {
      width: '100%',
      maxWidth: 980,
      background: 'rgba(0,0,0,0.55)',
      borderRadius: 24,
      border: '1px solid rgba(255,40,0,0.15)',
      boxShadow: '0 40px 120px rgba(0,0,0,0.9)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      padding: '28px 26px 26px',
      color: '#ffffff',
      animation: 'fadeUp .7s ease forwards',
      fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    },
    headingRow: {
      display: 'flex',
      alignItems: 'center',
      marginBottom: 12
    },
    headingTitle: {
      fontFamily: "'Space Mono', monospace",
      fontSize: 22,
      letterSpacing: '0.18em',
      textTransform: 'uppercase'
    },
    subText: {
      fontSize: 13,
      color: 'rgba(255,255,255,0.4)'
    },
    statusPill: (ok) => ({
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: 999,
      padding: '4px 10px',
      fontSize: 11,
      fontFamily: "'Space Mono', monospace",
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      border: ok ? '1px solid rgba(0,200,120,0.6)' : '1px solid rgba(255,60,0,0.7)',
      color: ok ? 'rgba(160,255,210,0.95)' : '#ff3300',
      background: ok ? 'rgba(0,60,30,0.9)' : 'rgba(30,0,0,0.9)'
    }),
    glassSection: {
      background: 'transparent',
      padding: '16px 0',
      marginTop: 16
    },
    inputBar: {
      background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 100%)',
      borderRadius: 16,
      padding: 12,
      marginTop: 16,
      display: 'flex',
      gap: 10,
      alignItems: 'flex-end',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,40,0,0.12)'
    },
    textField: {
      flex: 1,
      background: 'rgba(255,255,255,0.04)',
      borderRadius: 12
    },
    primaryButton: {
      minWidth: 90,
      height: 40,
      borderRadius: 12,
      border: 'none',
      background: '#ffffff',
      color: '#000000',
      fontWeight: 600,
      fontSize: 13,
      cursor: 'pointer',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 18px 40px rgba(0,0,0,0.85)'
    }
  };

  return (
    <div style={shellStyles.page}>
      <div style={shellStyles.card}>
        <Box sx={shellStyles.headingRow}>
          <IconButton 
            onClick={() => navigate('/friends')} 
            sx={{ mr: 2, color: '#ff3300' }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Box>
            <Typography component="h1" sx={shellStyles.headingTitle}>
              Chat {friendName && `· ${friendName}`}
            </Typography>
            <Typography sx={shellStyles.subText}>
              End-to-end WebRTC with on-chain message proofs.
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 1.5 }}>
          <AvatarAnimated3D address={account} size={44} />
          <Box>
            <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{username}</Typography>
            <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: "'Space Mono', monospace" }}>
              {account}
            </Typography>
          </Box>
        </Box>

        {receiver && (
          <Box sx={{ mt: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography sx={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
                Chatting with <span style={{ color: '#ffffff' }}>{friendName || 'Unknown peer'}</span>
              </Typography>
              <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: "'Space Mono', monospace" }}>
                {receiver}
              </Typography>
            </Box>
            <span style={shellStyles.statusPill(connected)}>
              {connected ? 'P2P Live' : 'Chain Sync'}
            </span>
          </Box>
        )}

        {error && (
          <Box sx={{ mt: 2, p: 1.5, borderRadius: 12, border: '1px solid rgba(255,60,0,0.6)', background: 'rgba(40,0,0,0.9)', fontSize: 13 }}>
            {error}
          </Box>
        )}

        <Box sx={{ ...shellStyles.glassSection, background: 'transparent', border: 'none', padding: 0, marginTop: 2 }}>
          {/* Compact connection pill */}
          <Box sx={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: 1, 
            px: 1.5, 
            py: 1, 
            mb: 2,
            borderRadius: 999,
            background: connected ? 'rgba(0,100,60,0.15)' : 'rgba(255,60,0,0.08)',
            border: '1px solid ' + (connected ? 'rgba(0,200,120,0.4)' : 'rgba(255,60,0,0.25)'),
          }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: connected ? 'rgba(0,255,120,0.9)' : '#ff3300' }} />
            <Typography variant="caption" sx={{ color: connected ? 'rgba(160,255,210,0.95)' : '#ff3300', fontWeight: 600, fontSize: 12 }}>
              {connected ? 'P2P Live' : (isRetrying ? `Retrying (${connectionAttempts}/3)…` : (connectionAttempts >= 3 ? 'Blockchain sync' : 'Connecting…'))}
            </Typography>
          </Box>

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

          <Box sx={shellStyles.inputBar}>
            <TextField
              fullWidth
              multiline
              maxRows={4}
              variant="outlined"
              placeholder={connected ? "Type your message..." : "Type your message (will sync via blockchain)..."}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={!receiver.trim() || loading}
              size="small"
              InputProps={{
                sx: {
                  ...shellStyles.textField,
                  color: '#ffffff',
                  '& .MuiInputBase-input': {
                    color: '#ffffff'
                  },
                  '& .MuiInputBase-input::placeholder': {
                    color: 'rgba(255,255,255,0.5)'
                  },
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.14)' },
                  '&:hover fieldset': { borderColor: 'rgba(255,60,0,0.4)' },
                  '&.Mui-focused fieldset': { borderColor: 'rgba(255,60,0,0.8)' },
                  '&.Mui-focused': {
                    boxShadow: '0 0 0 1px rgba(255,60,0,0.8)',
                  }
                }
              }}
            />
            <Tooltip title={connected ? "Attach file (P2P only)" : "File transfer requires P2P connection"}>
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
            <Tooltip title={connected ? "Send via P2P + Blockchain" : "Send via Blockchain (slower but reliable)"}>
              <span>
                <button
                  style={{
                    ...shellStyles.primaryButton,
                    opacity: !message.trim() || loading ? 0.5 : 1,
                    cursor: !message.trim() || loading ? 'not-allowed' : 'pointer'
                  }}
                  onClick={handleSendMessage}
                  disabled={!message.trim() || loading}
                >
                  {loading ? <CircularProgress size={22} sx={{ color: '#ff3300' }} /> : <SendIcon sx={{ color: '#000000' }} />}
                  <span
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.08), transparent)',
                      backgroundSize: '200% 100%',
                      animation: 'shimmer 3s ease-in-out infinite',
                      pointerEvents: 'none'
                    }}
                  />
                </button>
              </span>
            </Tooltip>
          </Box>
        </Box>

        <Box sx={{ ...shellStyles.glassSection, mt: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography sx={{ fontFamily: "'Space Mono', monospace", fontSize: 14, letterSpacing: '0.16em' }}>
              Messages
            </Typography>
            <Tooltip title="Refresh messages">
              <IconButton onClick={loadMessages} disabled={loading} size="small">
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>

          {messages.length > 0 ? (
            <List sx={{ maxHeight: '60vh', overflow: 'auto', p: 0 }}>
              {messages.map((msg, i) => {
                const isIncoming = msg.incoming;
                return (
                  <ListItem
                    key={msg.id || i}
                    alignItems="flex-start"
                    sx={{
                      py: 1.5,
                      px: 0,
                      flexDirection: isIncoming ? 'row' : 'row-reverse',
                    }}
                  >
                    <ListItemAvatar sx={{ minWidth: 0, mr: isIncoming ? 1.5 : 0, ml: isIncoming ? 0 : 1.5 }}>
                      <AvatarAnimated3D
                        address={isIncoming ? (msg.from || receiver) : account}
                        size={36}
                      />
                    </ListItemAvatar>
                    <Box
                      sx={{
                        maxWidth: '75%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: isIncoming ? 'flex-start' : 'flex-end',
                      }}
                    >
                      <Box
                        sx={{
                          px: 2,
                          py: 1.25,
                          borderRadius: isIncoming ? '18px 18px 18px 4px' : '18px 18px 4px 18px',
                          background: isIncoming
                            ? 'linear-gradient(135deg, rgba(255,60,0,0.12) 0%, rgba(255,40,0,0.06) 100%)'
                            : 'linear-gradient(135deg, rgba(255,60,0,0.35) 0%, rgba(255,80,20,0.2) 100%)',
                          border: isIncoming
                            ? '1px solid rgba(255,60,0,0.25)'
                            : '1px solid rgba(255,60,0,0.4)',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            display: 'block',
                            color: 'rgba(255,255,255,0.6)',
                            fontSize: 11,
                            mb: 0.5,
                          }}
                        >
                          {isIncoming ? (friendName || (msg.from ? `${msg.from.slice(0, 6)}...${msg.from.slice(-4)}` : 'Unknown')) : 'You'}
                          {' · '}{msg.time ? formatDistanceToNow(getMessageTime(msg)) : 'now'}
                        </Typography>
                        {msg.type === 'file' ? (
                          <Box sx={{ mt: 0.5 }}>
                            {msg.fileType?.startsWith('image/') && msg.fileUrl ? (
                              <Box
                                component="img"
                                src={msg.fileUrl}
                                alt={msg.fileName}
                                sx={{
                                  maxWidth: 260,
                                  maxHeight: 260,
                                  borderRadius: 2,
                                  cursor: 'pointer',
                                  display: 'block',
                                }}
                                onClick={() => window.open(msg.fileUrl, '_blank')}
                              />
                            ) : (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, bgcolor: 'rgba(0,0,0,0.25)', borderRadius: 2 }}>
                                {getFileIcon(msg.fileType)}
                                <Box sx={{ flex: 1 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{msg.fileName}</Typography>
                                  {msg.fileSize && (
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                                      {formatFileSize(msg.fileSize)}
                                    </Typography>
                                  )}
                                </Box>
                                {msg.fileUrl && (
                                  <Button size="small" variant="outlined" href={msg.fileUrl} download={msg.fileName} sx={{ borderColor: 'rgba(255,255,255,0.4)', color: '#fff' }}>
                                    Download
                                  </Button>
                                )}
                              </Box>
                            )}
                          </Box>
                        ) : (
                          <Typography variant="body1" sx={{ wordBreak: 'break-word', lineHeight: 1.5 }}>
                            {msg.content || 'Content via P2P (metadata only)'}
                          </Typography>
                        )}
                      </Box>
                      {msg.messageHash && String(msg.messageHash).length > 4 && (
                        <Typography
                          variant="caption"
                          sx={{
                            fontFamily: "'Space Mono', monospace",
                            color: 'rgba(255,255,255,0.3)',
                            fontSize: 10,
                            mt: 0.5,
                          }}
                        >
                          {String(msg.messageHash).slice(0, 10)}…{String(msg.messageHash).slice(-8)}
                        </Typography>
                      )}
                    </Box>
                  </ListItem>
                );
              })}
            </List>
          ) : (
            <Box sx={{ 
              textAlign: 'center', 
              py: 6, 
              px: 2,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              color: 'rgba(255,255,255,0.5)',
            }}>
              <AvatarAnimated3D address={receiver || account || '0x0'} size={120} />
              <Typography sx={{ mt: 3, fontFamily: "'Space Mono', monospace", fontSize: 16, color: 'rgba(255,255,255,0.9)' }}>
                No messages yet
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', mt: 1 }} display="block">
                Say hi to start the conversation
              </Typography>
              {!connected && connectionAttempts >= 3 && (
                <Typography variant="caption" color="warning.main" display="block" sx={{ mt: 1 }}>
                  Using blockchain sync mode (P2P connection unavailable)
                </Typography>
              )}
            </Box>
          )}
        </Box>
      </div>
    </div>
  );
}

export default Chat;