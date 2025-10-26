import React, { useEffect, useState, useCallback } from "react";
import { 
  initWeb3, 
  storeMessageMetadata, 
  getMessageMetadata, 
  getContract,
  getWeb3 
} from "../utils/blockchain";

function Chat({ walletAddress }) {
  const [contractReady, setContractReady] = useState(false);
  const [messages, setMessages] = useState([]);
  const [receiver, setReceiver] = useState("");
  const [message, setMessage] = useState("");
  const [account, setAccount] = useState(walletAddress);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize web3 and contract
  useEffect(() => {
    let mounted = true;
    
    const setup = async () => {
      try {
        const { account: acc } = await initWeb3();
        if (!mounted) return;
        
        setAccount(acc);
        setContractReady(true);
        await loadMessages();
      } catch (err) {
        console.error("❌ Failed to initialize:", err);
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
  }, []);

  // Load messages from the blockchain
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
                id: i
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
  }, []);

  // Handle sending a new message
  const handleSendMessage = async () => {
    if (!message.trim() || !receiver.trim()) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Ensure web3 is initialized
      if (!window.ethereum) {
        await initWeb3();
      }
      
      // Get web3 instance and create message hash
      const web3 = getWeb3();
      const messageHash = web3.utils.sha3(message);

      // Send the transaction
      await storeMessageMetadata(account, receiver, messageHash);
      
      // Update the UI
      setMessage("");
      await loadMessages();
      
    } catch (err) {
      console.error("❌ Failed to send message:", err);
      setError(`Failed to send message: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "40px" }}>
        <p>Loading chat data...</p>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </div>
    );
  }

  return (
    <div style={{ padding: "20px", maxWidth: '800px', margin: '0 auto' }}>
      <h2>Decentralized Chat</h2>
      <p><strong>Connected Wallet:</strong> {account}</p>
      
      {error && (
        <div style={{ 
          backgroundColor: '#ffebee', 
          color: '#c62828', 
          padding: '10px', 
          margin: '10px 0',
          borderRadius: '4px'
        }}>
          {error}
        </div>
      )}

      <div style={{ 
        backgroundColor: '#f8f9fa', 
        padding: '20px', 
        borderRadius: '8px',
        margin: '20px 0'
      }}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            To (Wallet Address):
          </label>
          <input
            type="text"
            placeholder="0x..."
            value={receiver}
            onChange={(e) => setReceiver(e.target.value)}
            style={{ 
              width: "100%", 
              maxWidth: '500px',
              padding: "10px",
              borderRadius: "4px",
              border: "1px solid #ddd",
              fontSize: '14px'
            }}
            disabled={loading}
          />
        </div>
        
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Message:
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              placeholder="Type your message here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              style={{ 
                flex: 1,
                padding: "10px",
                borderRadius: "4px",
                border: "1px solid #ddd",
                fontSize: '14px'
              }}
              onKeyPress={(e) => e.key === 'Enter' && !loading && handleSendMessage()}
              disabled={loading}
            />
            <button 
              onClick={handleSendMessage}
              disabled={loading || !receiver || !message}
              style={{
                padding: "10px 20px",
                backgroundColor: !loading && receiver && message ? "#007bff" : "#6c757d",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: (!loading && receiver && message) ? "pointer" : "not-allowed",
                fontWeight: 'bold',
                minWidth: '120px'
              }}
            >
              {loading ? "Sending..." : "Send Message"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '30px' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '15px'
        }}>
          <h3 style={{ margin: 0 }}>📜 On-chain Messages</h3>
          <button 
            onClick={loadMessages}
            disabled={loading}
            style={{
              padding: '5px 10px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            🔄 Refresh
          </button>
        </div>
        
        {messages.length > 0 ? (
          <div style={{
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            {messages.map((msg, i) => (
              <div 
                key={msg.id || i}
                style={{
                  padding: '15px',
                  borderBottom: i < messages.length - 1 ? '1px solid #e0e0e0' : 'none',
                  backgroundColor: i % 2 === 0 ? '#fff' : '#f9f9f9',
                  transition: 'background-color 0.2s'
                }}
              >
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  marginBottom: '8px'
                }}>
                  <div>
                    <strong>Message #{i + 1}</strong>
                    <span style={{
                      fontSize: '12px',
                      color: '#666',
                      marginLeft: '10px'
                    }}>
                      ID: {msg.id}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {new Date().toLocaleString()}
                  </div>
                </div>
                <div style={{ marginBottom: '5px' }}>
                  <span style={{ color: '#666' }}>To: </span>
                  <span style={{
                    fontFamily: 'monospace',
                    backgroundColor: '#f0f0f0',
                    padding: '2px 5px',
                    borderRadius: '3px',
                    fontSize: '13px'
                  }}>
                    {msg.receiver}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#666' }}>Hash: </span>
                  <span style={{
                    fontFamily: 'monospace',
                    backgroundColor: '#f0f0f0',
                    padding: '2px 5px',
                    borderRadius: '3px',
                    fontSize: '12px',
                    wordBreak: 'break-all',
                    display: 'inline-block',
                    maxWidth: '100%'
                  }}>
                    {msg.messageHash}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            backgroundColor: '#f8f9fa',
            padding: '30px',
            textAlign: 'center',
            borderRadius: '8px',
            color: '#6c757d'
          }}>
            <p style={{ margin: '0 0 15px 0' }}>No messages found yet.</p>
            <p style={{ margin: 0, fontSize: '14px' }}>
              Send your first message to start the conversation!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Chat;
