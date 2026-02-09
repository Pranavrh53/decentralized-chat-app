import React, { useEffect, useState, useCallback, useRef } from "react";
import { 
  initWeb3,
  storeMessageMetadata,
  getMessageMetadata,
  hashMessage 
} from "../utils/blockchain";
import { createPeer, setupSignaling, cleanup, setGlobalCallbacks } from "../utils/webrtc";

const ChatPanel = ({ walletAddress, selectedUser, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  const [isInitiator, setIsInitiator] = useState(false);
  const peerRef = useRef(null);
  const handleIncomingMessageRef = useRef(null);
  const messagesEndRef = useRef(null);

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
      let messageText;
      
      if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data);
          messageText = parsed.text || parsed.content || data;
        } catch (e) {
          messageText = data;
        }
      } else if (data instanceof ArrayBuffer || data instanceof Blob) {
        messageText = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => resolve('(Binary data)');
          reader.readAsText(new Blob([data]));
        });
      } else if (typeof data === 'object' && data !== null) {
        messageText = data.text || data.content || JSON.stringify(data);
      } else {
        messageText = String(data);
      }

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
      
      // Receiver does NOT store metadata on blockchain - only sender does
      // This avoids the receiver needing to approve a transaction
    } catch (err) {
      console.error('[ChatPanel] Error processing incoming message:', err);
    }
  }, [receiver, walletAddress]);

  useEffect(() => {
    handleIncomingMessageRef.current = handleIncomingMessage;
  }, [handleIncomingMessage]);

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
              <div style={styles.messageText}>{msg.content || msg.text}</div>
              <div style={styles.messageTime}>
                {msg.time ? formatTime(msg.time) : 'just now'}
              </div>
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
        <input
          type="text"
          style={styles.input}
          placeholder={connected ? "Type a message..." : "Connect first to send messages"}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={!connected}
          onFocus={(e) => {
            e.target.style.borderColor = 'rgba(138, 102, 255, 0.6)';
            e.target.style.background = 'rgba(138, 102, 255, 0.15)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = 'rgba(138, 102, 255, 0.3)';
            e.target.style.background = 'rgba(138, 102, 255, 0.1)';
          }}
        />
        <button
          style={{
            ...styles.sendBtn,
            opacity: !connected || !message.trim() ? 0.5 : 1,
            cursor: !connected || !message.trim() ? 'not-allowed' : 'pointer',
          }}
          onClick={handleSendMessage}
          disabled={!connected || !message.trim()}
          onMouseEnter={(e) => {
            if (connected && message.trim()) {
              e.target.style.transform = 'scale(1.05)';
              e.target.style.boxShadow = '0 6px 20px rgba(138, 102, 255, 0.6)';
            }
          }}
          onMouseLeave={(e) => {
            if (connected && message.trim()) {
              e.target.style.transform = 'scale(1)';
              e.target.style.boxShadow = '0 4px 15px rgba(138, 102, 255, 0.4)';
            }
          }}
        >
          Send 📤
        </button>
      </div>
    </div>
  );
};

export default ChatPanel;
