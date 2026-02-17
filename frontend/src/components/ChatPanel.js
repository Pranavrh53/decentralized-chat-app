import React, { useEffect, useState, useCallback, useRef } from "react";
import { 
  initWeb3,
  storeMessageMetadata,
  getMessageMetadata,
  hashMessage 
} from "../utils/blockchain";
import { 
  createPeer, 
  setupSignaling, 
  cleanup, 
  setGlobalCallbacks
} from "../utils/webrtc";
import { uploadFileToIPFS, getIPFSFileUrl, isImageFile, isFileSizeAcceptable } from "../utils/ipfs";

const ChatPanel = ({ walletAddress, selectedUser, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  const [isInitiator, setIsInitiator] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const peerRef = useRef(null);
  const handleIncomingMessageRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const receiver = selectedUser?.address;

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load messages from localStorage
  const loadMessages = useCallback(() => {
    if (!receiver || !walletAddress) return;
    
    const chatKey = `chat_${walletAddress}_${receiver}`;
    const chatHistory = JSON.parse(localStorage.getItem(chatKey) || '[]');
    setMessages(chatHistory);
  }, [receiver, walletAddress]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Handle incoming WebRTC messages
  const handleIncomingMessage = useCallback(async (data) => {
    console.log('[ChatPanel] Raw incoming data:', data);
    
    try {
      let messageData;
      
      if (typeof data === 'string') {
        try {
          messageData = JSON.parse(data);
        } catch (e) {
          messageData = { type: 'text', text: data };
        }
      } else {
        messageData = { type: 'text', text: String(data) };
      }

      // Handle file messages
      if (messageData.type === 'file') {
        const newMsg = {
          id: Date.now(),
          type: 'file',
          content: messageData.fileName,
          ipfsHash: messageData.ipfsHash,
          fileName: messageData.fileName,
          fileType: messageData.fileType,
          fileSize: messageData.fileSize,
          url: messageData.url,
          sender: receiver,
          time: new Date(),
          timestamp: messageData.timestamp || new Date().toISOString(),
          incoming: true,
          status: 'received'
        };

        setMessages(prev => [...prev, newMsg]);
        
        const chatKey = `chat_${walletAddress}_${receiver}`;
        const chatHistory = JSON.parse(localStorage.getItem(chatKey) || '[]');
        chatHistory.push(newMsg);
        localStorage.setItem(chatKey, JSON.stringify(chatHistory));
        return;
      }

      // Handle text messages
      const messageText = messageData.text || messageData.content || String(data);
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

      console.log('[ChatPanel] Adding message to UI:', newMsg);
      setMessages(prev => [...prev, newMsg]);
      
      const chatKey = `chat_${walletAddress}_${receiver}`;
      const chatHistory = JSON.parse(localStorage.getItem(chatKey) || '[]');
      chatHistory.push(newMsg);
      localStorage.setItem(chatKey, JSON.stringify(chatHistory));
      
    } catch (err) {
      console.error('[ChatPanel] Error processing incoming message:', err);
    }
  }, [receiver, walletAddress]);

  useEffect(() => {
    handleIncomingMessageRef.current = handleIncomingMessage;
  }, [handleIncomingMessage]);

  // Handle file selection
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Check file size (max 10MB)
    if (!isFileSizeAcceptable(file.size)) {
      setError('File size must be less than 10MB');
      return;
    }

    setSelectedFile(file);

    // Create preview for images
    if (isImageFile(file.type)) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }

    setError(null);
  };

  // Clear selected file
  const handleClearFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Send file via IPFS
  const handleSendFile = async () => {
    if (!selectedFile) return;

    if (!connected || !peerRef.current) {
      setError('Not connected - click "Connect" first');
      return;
    }

    setLoading(true);
    setUploadProgress(0);

    try {
      // Upload file to IPFS
      console.log('📤 Uploading file to IPFS...');
      const fileData = await uploadFileToIPFS(selectedFile, {
        sender: walletAddress,
        receiver: receiver,
        timestamp: new Date().toISOString()
      });

      setUploadProgress(50);

      // Store file metadata on blockchain
      const hash = await hashMessage(fileData.ipfsHash);
      await storeMessageMetadata(walletAddress, receiver, hash, fileData.ipfsHash);

      setUploadProgress(75);

      // Send file info via WebRTC
      const fileMessage = {
        type: 'file',
        ipfsHash: fileData.ipfsHash,
        fileName: fileData.fileName,
        fileType: fileData.fileType,
        fileSize: fileData.fileSize,
        url: fileData.url,
        timestamp: new Date().toISOString(),
        sender: walletAddress
      };

      peerRef.current.send(JSON.stringify(fileMessage));

      // Add to local messages
      const newMessage = {
        id: Date.now(),
        type: 'file',
        content: fileData.fileName,
        ipfsHash: fileData.ipfsHash,
        fileName: fileData.fileName,
        fileType: fileData.fileType,
        fileSize: fileData.fileSize,
        url: fileData.url,
        sender: walletAddress,
        time: new Date(),
        timestamp: new Date().toISOString(),
        incoming: false,
        status: 'sent'
      };

      setMessages(prev => [...prev, newMessage]);

      // Save to localStorage
      const chatKey = `chat_${walletAddress}_${receiver}`;
      const chatHistory = JSON.parse(localStorage.getItem(chatKey) || '[]');
      chatHistory.push(newMessage);
      localStorage.setItem(chatKey, JSON.stringify(chatHistory));

      setUploadProgress(100);

      // Clear file selection
      handleClearFile();
      
    } catch (error) {
      console.error('Error sending file:', error);
      setError(`Failed to send file: ${error.message}`);
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  // Auto-responder setup
  useEffect(() => {
    if (receiver && receiver !== walletAddress && !isInitiator) {
      console.log('[ChatPanel] Setting up auto-responder');
      
      if (peerRef.current && !peerRef.current.destroyed) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
      
      const onData = (data) => {
        console.log('[ChatPanel] Responder received data:', data);
        if (handleIncomingMessageRef.current) {
          handleIncomingMessageRef.current(data);
        }
      };
      
      const onConnect = () => {
        console.log('[ChatPanel] Responder connected!');
        setConnected(true);
      };
      
      const onError = (err) => {
        console.error('[ChatPanel] Responder error:', err);
        setError(err.message);
        setConnected(false);
      };
      
      setGlobalCallbacks(onData, onConnect, onError);

      const handleSignal = (signal) => {
        if (signal.type === 'answer') return;
        
        if (!peerRef.current) {
          if (signal.type === 'offer') {
            peerRef.current = createPeer(false, walletAddress, receiver, onData, onConnect, onError);
            try {
              peerRef.current.signal(signal);
            } catch (err) {
              console.error('[ChatPanel] Error signaling offer:', err);
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
              peerRef.current = createPeer(false, walletAddress, receiver, onData, onConnect, onError);
              try {
                peerRef.current.signal(signal);
              } catch (err) {
                console.error('[ChatPanel] Error signaling offer:', err);
              }
            }
            return;
          }
          
          try {
            peerRef.current.signal(signal);
          } catch (err) {
            console.error('[ChatPanel] Error signaling peer:', err);
          }
        }
      };

      setupSignaling(walletAddress, handleSignal, receiver);
      
      return () => {
        console.log('[ChatPanel] Auto-responder cleanup');
        cleanup(false);
      };
    }
  }, [receiver, walletAddress]);

  // Start P2P chat as initiator
  const startChat = () => {
    if (!receiver || receiver === walletAddress) {
      setError('Invalid receiver');
      return;
    }
    if (connected) return;

    console.log('[ChatPanel] Starting as initiator');
    setIsInitiator(true);
    setError(null);
    setConnected(false);
    cleanup(true);

    const onData = (data) => {
      console.log('[ChatPanel] Initiator received data:', data);
      if (handleIncomingMessageRef.current) {
        handleIncomingMessageRef.current(data);
      }
    };
    
    const onConnect = () => {
      console.log('[ChatPanel] Initiator connected!');
      setConnected(true);
    };
    
    const onError = (err) => {
      console.error('[ChatPanel] Initiator error:', err);
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
          console.error('[ChatPanel] Error signaling peer:', err);
        }
      }
    };

    setupSignaling(walletAddress, handleSignal, receiver);

    peerRef.current = createPeer(true, walletAddress, receiver, onData, onConnect, onError);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup(false);
    };
  }, []);

  // Send message
  const handleSendMessage = async () => {
    if (!message.trim()) return;

    if (!connected || !peerRef.current) {
      setError('Not connected - click "Connect" first');
      return;
    }

    try {
      const dataChannel = peerRef.current._channel;
      if (!dataChannel || dataChannel.readyState !== 'open') {
        throw new Error('Connection not ready');
      }

      // IMPORTANT: Store metadata on blockchain FIRST (requires transaction approval)
      // Only after approval, send the actual message via WebRTC
      const hash = await hashMessage(message);
      await storeMessageMetadata(walletAddress, receiver, hash);

      const messageObj = {
        text: message,
        timestamp: new Date().toISOString(),
        sender: walletAddress,
        type: 'text'
      };

      const messageString = JSON.stringify(messageObj);
      peerRef.current.send(messageString);

      const newMessage = {
        id: Date.now(),
        content: message,
        text: message,
        sender: walletAddress,
        time: new Date(),
        timestamp: new Date().toISOString(),
        incoming: false,
        status: 'sent',
        messageHash: hash
      };

      setMessages(prev => [...prev, newMessage]);
      
      const chatKey = `chat_${walletAddress}_${receiver}`;
      const chatHistory = JSON.parse(localStorage.getItem(chatKey) || '[]');
      chatHistory.push(newMessage);
      localStorage.setItem(chatKey, JSON.stringify(chatHistory));
      
      setMessage('');
    } catch (err) {
      console.error('[ChatPanel] Send error:', err);
      setError('Failed to send: ' + err.message);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getAvatarEmoji = (username) => {
    const emojis = ['👨', '👩', '🧑', '👦', '👧', '🧔', '👴', '👵'];
    const index = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % emojis.length;
    return emojis[index];
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: '700px',
      background: 'linear-gradient(135deg, #1a1f3a 0%, #2d1b4e 100%)',
      borderRadius: '20px',
      border: '1px solid rgba(138, 102, 255, 0.2)',
      overflow: 'hidden',
    },
    header: {
      padding: '25px 30px',
      background: 'rgba(138, 102, 255, 0.1)',
      borderBottom: '1px solid rgba(138, 102, 255, 0.2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    userInfo: {
      display: 'flex',
      alignItems: 'center',
      gap: '15px',
    },
    avatar: {
      width: '56px',
      height: '56px',
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #ff8c42 0%, #ff6b35 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '28px',
    },
    userName: {
      fontSize: '20px',
      fontWeight: '700',
      color: '#ffffff',
    },
    userAddress: {
      fontSize: '13px',
      color: '#8a66ff',
      fontFamily: 'monospace',
    },
    closeBtn: {
      background: 'transparent',
      border: '2px solid rgba(255, 107, 53, 0.5)',
      color: '#ff6b35',
      borderRadius: '10px',
      padding: '10px 20px',
      fontSize: '15px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
    },
    connectionStatus: {
      padding: '15px 30px',
      background: connected ? 'rgba(74, 222, 128, 0.2)' : 'rgba(255, 140, 66, 0.2)',
      borderBottom: '1px solid ' + (connected ? 'rgba(74, 222, 128, 0.3)' : 'rgba(255, 140, 66, 0.3)'),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    statusText: {
      fontSize: '15px',
      color: connected ? '#4ade80' : '#ff8c42',
      fontWeight: '600',
    },
    connectBtn: {
      background: 'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '10px',
      padding: '10px 24px',
      fontSize: '15px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      boxShadow: '0 4px 15px rgba(138, 102, 255, 0.4)',
    },
    messagesContainer: {
      flex: 1,
      overflowY: 'auto',
      padding: '30px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      minHeight: '450px',
    },
    message: {
      maxWidth: '75%',
      padding: '14px 20px',
      borderRadius: '14px',
      wordBreak: 'break-word',
    },
    messageIncoming: {
      alignSelf: 'flex-start',
      background: 'rgba(138, 102, 255, 0.2)',
      borderBottomLeftRadius: '4px',
    },
    messageOutgoing: {
      alignSelf: 'flex-end',
      background: 'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)',
      borderBottomRightRadius: '4px',
    },
    messageText: {
      color: '#ffffff',
      fontSize: '16px',
      marginBottom: '6px',
      lineHeight: '1.5',
    },
    messageTime: {
      fontSize: '11px',
      color: 'rgba(255, 255, 255, 0.6)',
    },
    inputContainer: {
      padding: '25px 30px',
      background: 'rgba(26, 31, 58, 0.8)',
      borderTop: '1px solid rgba(138, 102, 255, 0.2)',
      display: 'flex',
      flexDirection: 'column',
      gap: '15px',
    },
    input: {
      flex: 1,
      padding: '14px 20px',
      background: 'rgba(138, 102, 255, 0.1)',
      border: '1px solid rgba(138, 102, 255, 0.3)',
      borderRadius: '12px',
      color: '#ffffff',
      fontSize: '16px',
      outline: 'none',
      transition: 'all 0.3s ease',
    },
    sendBtn: {
      background: 'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '12px',
      padding: '14px 32px',
      fontSize: '16px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      boxShadow: '0 4px 15px rgba(138, 102, 255, 0.4)',
    },
    emptyState: {
      textAlign: 'center',
      padding: '60px 30px',
      color: '#b8b8d1',
    },
    errorBanner: {
      padding: '15px 30px',
      background: 'rgba(239, 68, 68, 0.2)',
      borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
      color: '#ef4444',
      fontSize: '15px',
    },
  };

  if (!selectedUser) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>
          <div style={{ fontSize: '64px', marginBottom: '20px' }}>💬</div>
          <h3 style={{ fontSize: '24px', marginBottom: '10px', color: '#fff' }}>
            Select a user to start chatting
          </h3>
          <p>Choose a friend from the list to begin a secure conversation</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.userInfo}>
          <div style={styles.avatar}>
            {getAvatarEmoji(selectedUser.username)}
          </div>
          <div>
            <div style={styles.userName}>{selectedUser.username}</div>
            <div style={styles.userAddress}>
              {selectedUser.address.substring(0, 6)}...{selectedUser.address.slice(-4)}
            </div>
          </div>
        </div>
        <button 
          style={styles.closeBtn}
          onClick={onClose}
          onMouseEnter={(e) => {
            e.target.style.background = 'rgba(255, 107, 53, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'transparent';
          }}
        >
          ✕ Close
        </button>
      </div>

      {/* Connection Status */}
      <div style={styles.connectionStatus}>
        <span style={styles.statusText}>
          {connected ? '🟢 Connected' : '🔴 Not Connected'}
        </span>
        {!connected && !isInitiator && (
          <button 
            style={styles.connectBtn}
            onClick={startChat}
            onMouseEnter={(e) => {
              e.target.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'scale(1)';
            }}
          >
            Connect
          </button>
        )}
        {isInitiator && !connected && (
          <span style={styles.statusText}>⏳ Connecting...</span>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div style={styles.errorBanner}>
          ⚠️ {error}
        </div>
      )}

      {/* Messages */}
      <div style={styles.messagesContainer}>
        {messages.length > 0 ? (
          messages.map((msg, idx) => (
            <div
              key={msg.id || idx}
              style={{
                ...styles.message,
                ...(msg.incoming ? styles.messageIncoming : styles.messageOutgoing),
              }}
            >
              {/* File Message */}
              {msg.type === 'file' ? (
                <div>
                  {isImageFile(msg.fileType) ? (
                    <div>
                      <img 
                        src={msg.url || getIPFSFileUrl(msg.ipfsHash)} 
                        alt={msg.fileName}
                        style={{
                          maxWidth: '100%',
                          maxHeight: '300px',
                          borderRadius: '8px',
                          marginBottom: '8px'
                        }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'block';
                        }}
                      />
                      <div style={{ display: 'none', color: '#ff6b6b' }}>
                        ⚠️ Image failed to load
                      </div>
                    </div>
                  ) : (
                    <div style={{ 
                      padding: '12px',
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: '8px',
                      marginBottom: '8px'
                    }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>📄</div>
                      <div style={{ color: '#fff', fontWeight: 600 }}>{msg.fileName}</div>
                      <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px' }}>
                        {(msg.fileSize / 1024).toFixed(2)} KB
                      </div>
                    </div>
                  )}
                  <a 
                    href={msg.url || getIPFSFileUrl(msg.ipfsHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: '#a78bfa',
                      textDecoration: 'underline',
                      fontSize: '14px',
                      display: 'inline-block',
                      marginBottom: '8px'
                    }}
                  >
                    📥 Download
                  </a>
                  <div style={styles.messageTime}>
                    {msg.time ? formatTime(msg.time) : 'just now'}
                  </div>
                </div>
              ) : (
                /* Text Message */
                <div>
                  <div style={styles.messageText}>{msg.content || msg.text}</div>
                  <div style={styles.messageTime}>
                    {msg.time ? formatTime(msg.time) : 'just now'}
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <div style={{ ...styles.emptyState, padding: '20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '10px' }}>📭</div>
            <p>No messages yet. Start the conversation!</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={styles.inputContainer}>
        {/* File Preview */}
        {selectedFile && (
          <div style={{
            padding: '12px',
            background: 'rgba(138, 102, 255, 0.2)',
            borderRadius: '8px',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            {filePreview ? (
              <img 
                src={filePreview} 
                alt="preview" 
                style={{
                  width: '60px',
                  height: '60px',
                  objectFit: 'cover',
                  borderRadius: '6px'
                }}
              />
            ) : (
              <div style={{
                width: '60px',
                height: '60px',
                background: 'rgba(138, 102, 255, 0.3)',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px'
              }}>
                📄
              </div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: '14px' }}>
                {selectedFile.name}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px' }}>
                {(selectedFile.size / 1024).toFixed(2)} KB
              </div>
            </div>
            <button
              onClick={handleClearFile}
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                color: '#ef4444',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 12px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600
              }}
            >
              ✕
            </button>
            {!loading && (
              <button
                onClick={handleSendFile}
                style={{
                  background: 'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                Send File 📤
              </button>
            )}
            {loading && (
              <div style={{ color: '#8a66ff', fontSize: '12px' }}>
                Uploading... {uploadProgress}%
              </div>
            )}
          </div>
        )}

        {/* Input Row */}
        <div style={{ display: 'flex', gap: '15px', width: '100%' }}>
          {/* File Upload Button */}
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            accept="image/*,.pdf,.doc,.docx,.txt"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!connected || loading}
            style={{
              background: 'rgba(138, 102, 255, 0.2)',
              color: !connected || loading ? '#666' : '#8a66ff',
              border: '1px solid rgba(138, 102, 255, 0.3)',
              borderRadius: '12px',
              padding: '14px 20px',
              cursor: !connected || loading ? 'not-allowed' : 'pointer',
              fontSize: '20px',
              transition: 'all 0.3s ease',
            }}
            title="Attach file"
          >
            📎
          </button>

          {/* Text Input */}
          <input
            type="text"
            style={styles.input}
            placeholder={connected ? "Type a message..." : "Connect first to send messages"}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={!connected || loading}
            onFocus={(e) => {
              e.target.style.borderColor = 'rgba(138, 102, 255, 0.6)';
              e.target.style.background = 'rgba(138, 102, 255, 0.15)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(138, 102, 255, 0.3)';
              e.target.style.background = 'rgba(138, 102, 255, 0.1)';
            }}
          />

          {/* Send Button */}
          <button
            style={{
              ...styles.sendBtn,
              opacity: !connected || (!message.trim() && !selectedFile) || loading ? 0.5 : 1,
              cursor: !connected || (!message.trim() && !selectedFile) || loading ? 'not-allowed' : 'pointer',
            }}
            onClick={handleSendMessage}
            disabled={!connected || !message.trim() || loading}
            onMouseEnter={(e) => {
              if (connected && message.trim() && !loading) {
                e.target.style.transform = 'scale(1.05)';
                e.target.style.boxShadow = '0 6px 20px rgba(138, 102, 255, 0.6)';
              }
            }}
            onMouseLeave={(e) => {
              if (connected && message.trim() && !loading) {
                e.target.style.transform = 'scale(1)';
                e.target.style.boxShadow = '0 4px 15px rgba(138, 102, 255, 0.4)';
              }
            }}
          >
            Send 📤
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
