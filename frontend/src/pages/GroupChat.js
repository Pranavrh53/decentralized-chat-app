import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { initWeb3, getWeb3, hashMessage } from '../utils/blockchain';
import { uploadToIPFS, retrieveFromIPFS, uploadFileToIPFS, getIPFSFileUrl, isImageFile, isFileSizeAcceptable } from '../utils/ipfs';
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
  ExitToApp as ExitIcon,
  AttachFile as AttachFileIcon,
  Close as CloseIcon
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
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
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

    setError('');
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

    setLoading(true);
    setUploadProgress(0);

    try {
      // Upload file to IPFS
      console.log('📤 Uploading file to IPFS...');
      const fileData = await uploadFileToIPFS(selectedFile, {
        sender: walletAddress,
        groupId: groupId,
        timestamp: new Date().toISOString()
      });

      setUploadProgress(50);

      // Store file metadata on blockchain
      const hash = await hashMessage(fileData.ipfsHash);
      await contract.methods
        .sendGroupMessage(groupId, hash, fileData.ipfsHash)
        .send({ from: walletAddress });

      setUploadProgress(75);

      // Add to local messages
      const newMessage = {
        id: Date.now().toString(),
        type: 'file',
        content: fileData.fileName,
        ipfsHash: fileData.ipfsHash,
        fileName: fileData.fileName,
        fileType: fileData.fileType,
        fileSize: fileData.fileSize,
        url: fileData.url,
        sender: walletAddress,
        timestamp: new Date().toISOString(),
        isOwn: true
      };

      const updatedMessages = [...messages, newMessage];
      setMessages(updatedMessages);

      // Save to localStorage
      const localKey = `group_messages_${groupId}`;
      localStorage.setItem(localKey, JSON.stringify(updatedMessages));

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
                {/* File Message */}
                {msg.type === 'file' ? (
                  <Box>
                    {isImageFile(msg.fileType) ? (
                      <Box>
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
                        <Box style={{ display: 'none', color: '#ff6b6b' }}>
                          ⚠️ Image failed to load
                        </Box>
                      </Box>
                    ) : (
                      <Box style={{ 
                        padding: '12px',
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: '8px',
                        marginBottom: '8px'
                      }}>
                        <Box style={{ fontSize: '32px', marginBottom: '8px' }}>📄</Box>
                        <Typography style={{ color: '#fff', fontWeight: 600 }}>{msg.fileName}</Typography>
                        <Typography style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px' }}>
                          {(msg.fileSize / 1024).toFixed(2)} KB
                        </Typography>
                      </Box>
                    )}
                    <a 
                      href={msg.url || getIPFSFileUrl(msg.ipfsHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: '#a78bfa',
                        textDecoration: 'underline',
                        fontSize: '14px'
                      }}
                    >
                      📥 Download
                    </a>
                  </Box>
                ) : (
                  /* Text Message */
                  <Typography style={styles.messageText}>{msg.content}</Typography>
                )}
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
        {/* File Preview */}
        {selectedFile && (
          <Box style={{
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
              <Box style={{
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
              </Box>
            )}
            <Box style={{ flex: 1 }}>
              <Typography style={{ color: '#fff', fontWeight: 600, fontSize: '14px' }}>
                {selectedFile.name}
              </Typography>
              <Typography style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px' }}>
                {(selectedFile.size / 1024).toFixed(2)} KB
              </Typography>
            </Box>
            <IconButton onClick={handleClearFile} style={{ color: '#ef4444' }}>
              <CloseIcon />
            </IconButton>
            {!loading && (
              <Button
                onClick={handleSendFile}
                variant="contained"
                style={{
                  background: 'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)',
                  color: 'white'
                }}
              >
                Send File 📤
              </Button>
            )}
            {loading && (
              <Typography style={{ color: '#8a66ff', fontSize: '12px' }}>
                {uploadProgress}%
              </Typography>
            )}
          </Box>
        )}

        {/* Input Row */}
        <Box style={{ display: 'flex', gap: '10px' }}>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            accept="image/*,.pdf,.doc,.docx,.txt"
          />
          <IconButton
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            style={{
              color: loading ? '#666' : '#8a66ff',
              background: 'rgba(138, 102, 255, 0.2)',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <AttachFileIcon />
          </IconButton>
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
    </Box>
  );
}

export default GroupChat;
