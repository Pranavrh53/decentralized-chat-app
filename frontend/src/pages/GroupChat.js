import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { initWeb3, getWeb3, hashMessage } from '../utils/blockchain';
import { uploadToIPFS, retrieveFromIPFS } from '../utils/ipfs';
import ChatMetadataABI from '../abis/ChatMetadata.json';
import {
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  List,
  ListItem,
  Avatar,
  IconButton,
  Chip,
  Divider,
  Menu,
  MenuItem,
  CircularProgress
} from '@mui/material';
import {
  Send as SendIcon,
  ArrowBack as ArrowBackIcon,
  People as PeopleIcon,
  MoreVert as MoreVertIcon,
  ExitToApp as ExitIcon
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';

function GroupChat({ walletAddress }) {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [group, setGroup] = useState(location.state?.group || null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [contract, setContract] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const messagesEndRef = useRef(null);
  const username = localStorage.getItem('username') || 'Anonymous';

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
    
    setupContract();
  }, []);

  // Load group and messages
  useEffect(() => {
    if (contract && groupId) {
      loadGroupData();
      loadMessages();
    }
  }, [contract, groupId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadGroupData = async () => {
    try {
      if (!group) {
        const groupInfo = await contract.methods.getGroup(groupId).call();
        setGroup({
          id: groupId,
          name: groupInfo.name,
          description: groupInfo.description,
          members: groupInfo.members,
          createdAt: new Date(Number(groupInfo.createdAt) * 1000).toISOString()
        });
      }
    } catch (error) {
      console.error('Error loading group:', error);
      setError('Failed to load group');
    }
  };

  const loadMessages = async () => {
    setLoading(true);
    try {
      // Load from localStorage first
      const localKey = `group_messages_${groupId}`;
      const localMessages = JSON.parse(localStorage.getItem(localKey) || '[]');
      if (localMessages.length > 0) {
        setMessages(localMessages);
      }

      // Load from blockchain
      const messageIds = await contract.methods.getGroupMessages(groupId).call();
      
      if (messageIds.length === 0) {
        setLoading(false);
        return;
      }

      const messagesData = await Promise.all(
        messageIds.map(async (msgId) => {
          const msgData = await contract.methods.getGroupMessage(msgId).call();
          
          // Retrieve content from IPFS
          let content = '';
          try {
            if (msgData.ipfsHash) {
              const ipfsData = await retrieveFromIPFS(msgData.ipfsHash);
              content = ipfsData.content || '';
            }
          } catch (err) {
            console.warn('Failed to load message from IPFS:', err);
            content = '(Message content unavailable)';
          }

          return {
            id: msgId.toString(), // Convert BigInt to string
            content: content,
            sender: msgData.sender,
            timestamp: new Date(Number(msgData.timestamp) * 1000).toISOString(), // Convert to ISO string
            ipfsHash: msgData.ipfsHash,
            isOwn: msgData.sender.toLowerCase() === walletAddress.toLowerCase()
          };
        })
      );

      // Merge and deduplicate
      const allMessages = [...localMessages];
      messagesData.forEach(msg => {
        if (!allMessages.find(m => m.id === msg.id)) {
          allMessages.push(msg);
        }
      });

      // Sort by timestamp
      allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      setMessages(allMessages);
      
      // Save to localStorage
      localStorage.setItem(localKey, JSON.stringify(allMessages));
      
    } catch (error) {
      console.error('Error loading messages:', error);
      setError('Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim()) {
      setError('Message cannot be empty');
      return;
    }

    setLoading(true);
    try {
      // Upload to IPFS
      const ipfsHash = await uploadToIPFS(message, {
        sender: walletAddress,
        groupId: groupId,
        timestamp: new Date().toISOString()
      });

      // Store on blockchain
      const hash = await hashMessage(message);
      await contract.methods
        .sendGroupMessage(groupId, hash, ipfsHash)
        .send({ from: walletAddress });

      // Add to local state immediately
      const newMessage = {
        id: Date.now().toString(),
        content: message,
        sender: walletAddress,
        timestamp: new Date().toISOString(),
        ipfsHash: ipfsHash,
        isOwn: true
      };

      setMessages(prev => [...prev, newMessage]);
      
      // Save to localStorage
      const localKey = `group_messages_${groupId}`;
      const updatedMessages = [...messages, newMessage];
      localStorage.setItem(localKey, JSON.stringify(updatedMessages));

      setMessage('');
      setError('');
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!window.confirm('Are you sure you want to leave this group?')) {
      return;
    }

    try {
      await contract.methods.leaveGroup(groupId).send({ from: walletAddress });
      navigate('/groups');
    } catch (error) {
      console.error('Error leaving group:', error);
      setError('Failed to leave group');
    }
  };

  const getSenderName = (address) => {
    if (address.toLowerCase() === walletAddress.toLowerCase()) {
      return 'You';
    }
    // Try to find name from friends list
    const normalizedAddress = walletAddress.toLowerCase();
    const friends = JSON.parse(localStorage.getItem(`friends_${normalizedAddress}`) || '[]');
    const friend = friends.find(f => f.address.toLowerCase() === address.toLowerCase());
    return friend ? friend.name : `${address.substring(0, 8)}...`;
  };

  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #2d1b4e 100%)',
      display: 'flex',
      flexDirection: 'column'
    },
    header: {
      background: 'linear-gradient(135deg, #1a1f3a 0%, #2d1b4e 100%)',
      padding: '20px 40px',
      borderBottom: '1px solid rgba(138, 102, 255, 0.2)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    headerLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: '20px'
    },
    groupInfo: {
      display: 'flex',
      flexDirection: 'column',
      gap: '5px'
    },
    groupName: {
      color: '#ffffff',
      fontSize: '24px',
      fontWeight: '600'
    },
    memberCount: {
      color: '#b8b8d1',
      fontSize: '14px',
      display: 'flex',
      alignItems: 'center',
      gap: '5px'
    },
    messagesContainer: {
      flex: 1,
      padding: '20px 40px',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '15px',
      maxHeight: 'calc(100vh - 250px)'
    },
    messageItem: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      maxWidth: '70%'
    },
    messageItemOwn: {
      alignSelf: 'flex-end',
      alignItems: 'flex-end'
    },
    messageBubble: {
      background: 'rgba(138, 102, 255, 0.1)',
      border: '1px solid rgba(138, 102, 255, 0.3)',
      borderRadius: '15px',
      padding: '12px 18px',
      wordWrap: 'break-word'
    },
    messageBubbleOwn: {
      background: 'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)',
      border: 'none'
    },
    senderName: {
      color: '#8a66ff',
      fontSize: '12px',
      fontWeight: '600',
      marginBottom: '5px'
    },
    messageText: {
      color: '#ffffff',
      fontSize: '15px',
      lineHeight: '1.5'
    },
    messageTime: {
      color: '#b8b8d1',
      fontSize: '11px',
      marginTop: '5px'
    },
    inputContainer: {
      background: 'linear-gradient(135deg, #1a1f3a 0%, #2d1b4e 100%)',
      padding: '20px 40px',
      borderTop: '1px solid rgba(138, 102, 255, 0.2)',
      display: 'flex',
      gap: '15px',
      alignItems: 'center'
    },
    input: {
      flex: 1,
      background: 'rgba(138, 102, 255, 0.1)',
      border: '1px solid rgba(138, 102, 255, 0.3)',
      borderRadius: '25px',
      padding: '12px 20px',
      color: '#ffffff',
      fontSize: '15px'
    },
    sendButton: {
      background: 'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '50%',
      width: '50px',
      height: '50px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      boxShadow: '0 4px 15px rgba(138, 102, 255, 0.4)',
      transition: 'all 0.3s ease'
    },
    emptyState: {
      textAlign: 'center',
      padding: '60px 20px',
      color: '#b8b8d1'
    }
  };

  return (
    <Box style={styles.container}>
      <Box style={styles.header}>
        <Box style={styles.headerLeft}>
          <IconButton 
            onClick={() => navigate('/groups')}
            style={{ color: '#8a66ff' }}
          >
            <ArrowBackIcon />
          </IconButton>
          
          <Avatar style={{ 
            background: 'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)',
            width: '50px',
            height: '50px',
            fontSize: '24px'
          }}>
            👥
          </Avatar>
          
          <Box style={styles.groupInfo}>
            <Typography style={styles.groupName}>{group?.name || 'Loading...'}</Typography>
            <Typography style={styles.memberCount}>
              <PeopleIcon style={{ fontSize: '16px' }} />
              {group?.members?.length || 0} members
            </Typography>
          </Box>
        </Box>

        <IconButton
          style={{ color: '#ffffff' }}
          onClick={(e) => setAnchorEl(e.currentTarget)}
        >
          <MoreVertIcon />
        </IconButton>

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
          PaperProps={{
            style: {
              background: '#1a1f3a',
              border: '1px solid rgba(138, 102, 255, 0.3)',
              color: '#ffffff'
            }
          }}
        >
          <MenuItem onClick={handleLeaveGroup} style={{ color: '#ef4444' }}>
            <ExitIcon style={{ marginRight: '10px' }} />
            Leave Group
          </MenuItem>
        </Menu>
      </Box>

      {error && (
        <Box padding="20px 40px">
          <Typography style={{ color: '#ef4444' }}>{error}</Typography>
        </Box>
      )}

      <Box style={styles.messagesContainer}>
        {loading && messages.length === 0 ? (
          <Box style={styles.emptyState}>
            <CircularProgress style={{ color: '#8a66ff' }} />
            <Typography style={{ marginTop: '20px' }}>Loading messages...</Typography>
          </Box>
        ) : messages.length === 0 ? (
          <Box style={styles.emptyState}>
            <Typography variant="h6">No messages yet</Typography>
            <Typography style={{ marginTop: '10px' }}>Be the first to send a message!</Typography>
            <Typography style={{ marginTop: '20px', fontSize: '48px' }}>💬</Typography>
          </Box>
        ) : (
          messages.map((msg, index) => (
            <Box
              key={index}
              style={{
                ...styles.messageItem,
                ...(msg.isOwn ? styles.messageItemOwn : {})
              }}
            >
              {!msg.isOwn && (
                <Typography style={styles.senderName}>
                  {getSenderName(msg.sender)}
                </Typography>
              )}
              <Paper
                style={{
                  ...styles.messageBubble,
                  ...(msg.isOwn ? styles.messageBubbleOwn : {})
                }}
              >
                <Typography style={styles.messageText}>{msg.content}</Typography>
              </Paper>
              <Typography style={styles.messageTime}>
                {formatDistanceToNow(new Date(msg.timestamp), { addSuffix: true })}
              </Typography>
            </Box>
          ))
        )}
        <div ref={messagesEndRef} />
      </Box>

      <Box style={styles.inputContainer}>
        <input
          type="text"
          placeholder="Type a message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && !loading && handleSendMessage()}
          style={styles.input}
          disabled={loading}
        />
        <button
          onClick={handleSendMessage}
          disabled={loading || !message.trim()}
          style={{
            ...styles.sendButton,
            opacity: loading || !message.trim() ? 0.5 : 1,
            cursor: loading || !message.trim() ? 'not-allowed' : 'pointer'
          }}
          onMouseEnter={(e) => !loading && (e.currentTarget.style.transform = 'scale(1.1)')}
          onMouseLeave={(e) => !loading && (e.currentTarget.style.transform = 'scale(1)')}
        >
          {loading ? <CircularProgress size={24} style={{ color: 'white' }} /> : <SendIcon />}
        </button>
      </Box>
    </Box>
  );
}

export default GroupChat;
