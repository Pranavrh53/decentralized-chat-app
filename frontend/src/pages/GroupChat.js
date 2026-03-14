// frontend/src/pages/GroupChat.js
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { initWeb3, getWeb3, hashMessage } from '../utils/blockchain';
import {
  uploadToIPFS,
  retrieveFromIPFS,
  uploadFileToIPFS,
  getIPFSFileUrl,
  isImageFile,
  isFileSizeAcceptable
} from '../utils/ipfs';
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
  Menu,
  MenuItem,
  CircularProgress,
  Tooltip
} from '@mui/material';
import {
  Send as SendIcon,
  ArrowBack as ArrowBackIcon,
  People as PeopleIcon,
  MoreVert as MoreVertIcon,
  ExitToApp as ExitIcon,
  AttachFile as AttachFileIcon,
  Close as CloseIcon,
  HowToVote as HowToVoteIcon
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
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [error, setError] = useState('');
  const [contract, setContract] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const [messageCount, setMessageCount] = useState(0);

  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const username = localStorage.getItem('username') || 'Anonymous';

  // Styles aligned with Home/Friends/Chat
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
      maxWidth: 1080,
      background: 'rgba(0,0,0,0.55)',
      borderRadius: 24,
      border: '1px solid rgba(255,40,0,0.15)',
      boxShadow: '0 40px 120px rgba(0,0,0,0.9)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      padding: '22px 22px 20px',
      color: '#ffffff',
      fontFamily:
        "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      display: 'flex',
      flexDirection: 'column'
    },
    headerRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8
    },
    headerLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: 16
    },
    groupPill: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    },
    groupAvatar: {
      width: 40,
      height: 40,
      borderRadius: 999,
      background:
        'linear-gradient(135deg, rgba(255,140,66,0.4) 0%, rgba(255,60,0,0.35) 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 22,
      boxShadow: '0 10px 30px rgba(0,0,0,0.9)'
    },
    headingTitle: {
      fontFamily: "'Space Mono', monospace",
      fontSize: 18,
      letterSpacing: '0.18em',
      textTransform: 'uppercase'
    },
    headingSub: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.5)'
    },
    metaRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
      marginTop: 6
    },
    metaChips: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8
    },
    descriptionBox: {
      fontSize: 13,
      color: 'rgba(255,255,255,0.7)',
      padding: '10px 12px',
      borderRadius: 12,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,40,0,0.12)',
      marginBottom: 10
    },
    messagesWrapper: {
      marginTop: 6,
      flex: 1,
      display: 'flex',
      flexDirection: 'column'
    },
    messagesList: {
      flex: 1,
      overflowY: 'auto',
      padding: '8px 4px 4px',
      maxHeight: '58vh'
    },
    messageRow: (isOwn) => ({
      display: 'flex',
      flexDirection: 'column',
      alignItems: isOwn ? 'flex-end' : 'flex-start',
      marginBottom: 10
    }),
    bubble: (isOwn) => ({
      maxWidth: '74%',
      padding: '10px 14px',
      borderRadius: isOwn ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
      background: isOwn
        ? 'linear-gradient(135deg, rgba(255,60,0,0.85) 0%, rgba(255,120,40,0.7) 100%)'
        : 'linear-gradient(135deg, rgba(255,60,0,0.18) 0%, rgba(255,60,0,0.06) 100%)',
      border: isOwn
        ? '1px solid rgba(255,120,40,0.85)'
        : '1px solid rgba(255,60,0,0.24)',
      boxShadow: '0 4px 18px rgba(0,0,0,0.6)'
    }),
    senderLabel: {
      fontSize: 11,
      color: 'rgba(255,255,255,0.7)',
      marginBottom: 3
    },
    messageText: {
      fontSize: 14,
      lineHeight: 1.5,
      wordBreak: 'break-word'
    },
    timeLabel: {
      fontSize: 11,
      color: 'rgba(255,255,255,0.45)',
      marginTop: 3
    },
    emptyState: {
      textAlign: 'center',
      padding: '40px 12px',
      color: 'rgba(255,255,255,0.6)'
    },
    inputShell: {
      marginTop: 10,
      borderRadius: 18,
      padding: 10,
      border: '1px solid rgba(255,40,0,0.18)',
      background:
        'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.7) 100%)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    },
    filePreviewRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: 10,
      borderRadius: 12,
      background: 'rgba(255,60,0,0.14)'
    },
    inputRow: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 10
    },
    sendButton: {
      minWidth: 88,
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
      } catch (err) {
        console.error('Error setting up contract:', err);
        setError('Blockchain connection failed. Group chat is in read-only mode.');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract, groupId]);

  // Auto-scroll to bottom when messages change
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
          createdAt: new Date(
            Number(groupInfo.createdAt) * 1000
          ).toISOString()
        });
      }
    } catch (err) {
      console.error('Error loading group:', err);
      setError('Failed to load group');
    }
  };

  const loadMessages = async () => {
    setLoadingInitial(true);
    try {
      const localKey = `group_messages_${groupId}`;
      const localMessages = JSON.parse(localStorage.getItem(localKey) || '[]');
      if (localMessages.length > 0) {
        setMessages(localMessages);
      }

      const messageIds = await contract.methods.getGroupMessages(groupId).call();
      if (messageIds.length === 0) {
        setMessageCount(0);
        setLoadingInitial(false);
        return;
      }
      setMessageCount(messageIds.length);

      const messagesData = await Promise.all(
        messageIds.map(async (msgId) => {
          const msgData = await contract.methods
            .getGroupMessage(msgId)
            .call();

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
            id: msgId.toString(),
            content,
            sender: msgData.sender,
            timestamp: new Date(
              Number(msgData.timestamp) * 1000
            ).toISOString(),
            ipfsHash: msgData.ipfsHash,
            isOwn:
              msgData.sender.toLowerCase() ===
              walletAddress.toLowerCase()
          };
        })
      );

      const allMessages = [...localMessages];
      messagesData.forEach((msg) => {
        if (!allMessages.find((m) => m.id === msg.id)) {
          allMessages.push(msg);
        }
      });

      allMessages.sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      );

      setMessages(allMessages);
      localStorage.setItem(localKey, JSON.stringify(allMessages));
    } catch (err) {
      console.error('Error loading messages:', err);
      setError('Failed to load messages');
    } finally {
      setLoadingInitial(false);
    }
  };

  // File selection
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!isFileSizeAcceptable(file.size)) {
      setError('File size must be less than 10MB');
      return;
    }

    setSelectedFile(file);

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

  const handleClearFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSendFile = async () => {
    if (!selectedFile) return;
    if (!contract) {
      setError('Blockchain not connected');
      return;
    }

    setLoading(true);
    setUploadProgress(0);

    try {
      const fileData = await uploadFileToIPFS(selectedFile, {
        sender: walletAddress,
        groupId,
        timestamp: new Date().toISOString()
      });

      setUploadProgress(50);

      const hash = await hashMessage(fileData.ipfsHash);
      await contract.methods
        .sendGroupMessage(groupId, hash, fileData.ipfsHash)
        .send({ from: walletAddress });

      setUploadProgress(75);

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

      const localKey = `group_messages_${groupId}`;
      localStorage.setItem(localKey, JSON.stringify(updatedMessages));

      setUploadProgress(100);
      handleClearFile();
    } catch (err) {
      console.error('Error sending file:', err);
      setError(`Failed to send file: ${err.message}`);
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
    if (!contract) {
      setError('Blockchain not connected');
      return;
    }

    setLoading(true);
    try {
      const ipfsHash = await uploadToIPFS(message, {
        sender: walletAddress,
        groupId,
        timestamp: new Date().toISOString()
      });

      const hash = await hashMessage(message);
      await contract.methods
        .sendGroupMessage(groupId, hash, ipfsHash)
        .send({ from: walletAddress });

      const newMessage = {
        id: Date.now().toString(),
        content: message,
        sender: walletAddress,
        timestamp: new Date().toISOString(),
        ipfsHash,
        isOwn: true
      };

      setMessages((prev) => [...prev, newMessage]);

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
    } catch (err) {
      console.error('Error leaving group:', err);
      setError('Failed to leave group');
    }
  };

  const getSenderName = (address) => {
    if (!address) return 'Unknown';
    if (address.toLowerCase() === walletAddress.toLowerCase()) {
      return username || 'You';
    }

    const normalizedAddress = walletAddress.toLowerCase();
    let friends = JSON.parse(
      localStorage.getItem(`friends_${normalizedAddress}`) || '[]'
    );
    if (friends.length === 0) {
      friends = JSON.parse(
        localStorage.getItem(`friends_${walletAddress}`) || '[]'
      );
    }

    const friend = friends.find(
      (f) => f.address?.toLowerCase() === address.toLowerCase()
    );
    return friend
      ? friend.name
      : `${address.substring(0, 6)}...${address.substring(
          address.length - 4
        )}`;
  };

  const getGroupEmoji = (name) => {
    const emojis = ['👥', '🎉', '💼', '🎮', '📚', '🎵', '⚽', '🍕', '🌟', '🚀'];
    if (!name) return '👥';
    const index =
      name
        .split('')
        .reduce((acc, char) => acc + char.charCodeAt(0), 0) % emojis.length;
    return emojis[index];
  };

  const createdLabel =
    group?.createdAt &&
    formatDistanceToNow(new Date(group.createdAt), { addSuffix: true });

  const isMember =
    !!group &&
    Array.isArray(group.members) &&
    group.members.some(
      (addr) =>
        addr &&
        addr.toString().toLowerCase() === walletAddress.toLowerCase()
    );

  const handleVoteForAdmin = async (memberAddress) => {
    if (!contract) {
      setError('Blockchain not connected');
      return;
    }

    if (!isMember) {
      setError('Only group members can vote for admins');
      return;
    }

    if (!memberAddress) return;

    const confirm = window.confirm(
      `Cast an on-chain admin vote for ${getSenderName(
        memberAddress
      )}?\n\nThis will send a blockchain transaction on Sepolia.`
    );
    if (!confirm) return;

    try {
      setLoading(true);
      await contract.methods
        .voteForAdmin(groupId, memberAddress)
        .send({ from: walletAddress });
      setError('');
    } catch (err) {
      console.error('Error voting for admin:', err);
      setError(
        err?.message || 'Failed to cast admin vote on-chain'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={shellStyles.page}>
      <div style={shellStyles.card}>
        {/* Header */}
        <Box sx={shellStyles.headerRow}>
          <Box sx={shellStyles.headerLeft}>
            <IconButton
              onClick={() => navigate('/groups')}
              sx={{ color: '#ff3300' }}
            >
              <ArrowBackIcon />
            </IconButton>
            <Box>
              <Typography component="h1" sx={shellStyles.headingTitle}>
                GROUP CHAT
              </Typography>
              <Typography sx={shellStyles.headingSub}>
                {group?.name || 'Loading group...'}
              </Typography>
            </Box>
          </Box>
          <IconButton
            onClick={(e) => setAnchorEl(e.currentTarget)}
            sx={{ color: '#ffffff' }}
          >
            <MoreVertIcon />
          </IconButton>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={() => setAnchorEl(null)}
            PaperProps={{
              sx: {
                background: '#111827',
                border: '1px solid rgba(255,60,0,0.4)',
                color: '#ffffff'
              }
            }}
          >
            <MenuItem
              onClick={handleLeaveGroup}
              sx={{ color: '#ef4444' }}
            >
              <ExitIcon sx={{ mr: 1 }} />
              Leave Group
            </MenuItem>
          </Menu>
        </Box>

        {/* Group meta row */}
        <Box sx={shellStyles.metaRow}>
          <Box sx={shellStyles.groupPill}>
            <Box sx={shellStyles.groupAvatar}>{getGroupEmoji(group?.name)}</Box>
            <Box>
              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                {group?.name || 'Unnamed Group'}
              </Typography>
              <Typography
                sx={{
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.55)',
                  fontFamily: "'Space Mono', monospace"
                }}
              >
                #{groupId}
              </Typography>
            </Box>
          </Box>
          <Box sx={shellStyles.metaChips}>
            <Chip
              icon={<PeopleIcon sx={{ fontSize: 16 }} />}
              label={`${group?.members?.length || 0} member${
                (group?.members?.length || 0) === 1 ? '' : 's'
              }`}
              size="small"
              sx={{
                backgroundColor: 'rgba(255,140,66,0.22)',
                color: '#ff8c42',
                fontSize: 11,
                height: 24
              }}
            />
            {createdLabel && (
              <Chip
                label={`Created ${createdLabel}`}
                size="small"
                sx={{
                  backgroundColor: 'rgba(148,163,184,0.18)',
                  color: 'rgba(226,232,240,0.9)',
                  fontSize: 11,
                  height: 24
                }}
              />
            )}
            {messageCount > 0 && (
              <Chip
                label={`${messageCount} msg${
                  messageCount === 1 ? '' : 's'
                } on-chain`}
                size="small"
                sx={{
                  backgroundColor: 'rgba(56,189,248,0.18)',
                  color: '#7dd3fc',
                  fontSize: 11,
                  height: 24
                }}
              />
            )}
            <Chip
              label={isMember ? 'Member' : 'View-only'}
              size="small"
              sx={{
                backgroundColor: isMember
                  ? 'rgba(34,197,94,0.18)'
                  : 'rgba(148,163,184,0.18)',
                color: isMember ? '#4ade80' : '#e5e7eb',
                fontSize: 11,
                height: 24
              }}
            />
          </Box>
        </Box>

        {/* Description */}
        <Box sx={shellStyles.descriptionBox}>
          {group?.description
            ? group.description
            : 'No description set for this group yet.'}
        </Box>

        {/* On-chain members list with decentralized admin voting */}
        {group?.members && group.members.length > 0 && (
          <Box sx={{ mb: 1.5 }}>
            <Typography
              sx={{
                fontSize: 12,
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
                fontFamily: "'Space Mono', monospace",
                color: 'rgba(255,255,255,0.6)',
                mb: 0.75
              }}
            >
              On-chain members
            </Typography>
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 1,
                maxHeight: 96,
                overflowY: 'auto'
              }}
            >
              {group.members.map((addr) => (
                <Chip
                  key={addr}
                  icon={
                    <HowToVoteIcon
                      sx={{
                        fontSize: 16,
                        color: 'rgba(249,115,22,0.9)'
                      }}
                    />
                  }
                  label={`${getSenderName(addr)} · ${addr.substring(
                    0,
                    6
                  )}...${addr.slice(-4)}`}
                  onClick={() => handleVoteForAdmin(addr)}
                  size="small"
                  sx={{
                    backgroundColor: 'rgba(255,60,0,0.08)',
                    borderColor: 'rgba(255,60,0,0.35)',
                    borderWidth: 1,
                    borderStyle: 'solid',
                    color: '#f97316',
                    fontSize: 11,
                    '&:hover': {
                      backgroundColor: 'rgba(255,60,0,0.16)'
                    }
                  }}
                />
              ))}
            </Box>
            <Typography
              sx={{
                mt: 0.5,
                fontSize: 11,
                color: 'rgba(255,255,255,0.45)'
              }}
            >
              Tap a member chip to cast an on‑chain admin vote (gas
              fees apply).
            </Typography>
          </Box>
        )}

        {/* Error banner */}
        {error && (
          <Box
            sx={{
              mt: 1,
              mb: 1,
              p: 1.2,
              borderRadius: 12,
              border: '1px solid rgba(239,68,68,0.7)',
              background: 'rgba(40,0,0,0.9)',
              fontSize: 13
            }}
          >
            {error}
          </Box>
        )}

        {/* Messages */}
        <Box sx={shellStyles.messagesWrapper}>
          {loadingInitial && messages.length === 0 ? (
            <Box sx={shellStyles.emptyState}>
              <CircularProgress sx={{ color: '#ff8c42', mb: 2 }} />
              <Typography>Loading messages from chain & IPFS…</Typography>
            </Box>
          ) : messages.length === 0 ? (
            <Box sx={shellStyles.emptyState}>
              <Typography sx={{ fontSize: 18, fontWeight: 600, mb: 1 }}>
                No messages yet
              </Typography>
              <Typography sx={{ fontSize: 14, mb: 2 }}>
                Be the first to say something to the group.
              </Typography>
              <Typography sx={{ fontSize: 42 }}>💬</Typography>
            </Box>
          ) : (
            <List sx={shellStyles.messagesList}>
              {messages.map((msg, index) => {
                const isOwn = msg.isOwn;
                const ts = msg.timestamp
                  ? new Date(msg.timestamp)
                  : new Date();

                return (
                  <ListItem
                    key={msg.id || index}
                    disableGutters
                    sx={shellStyles.messageRow(isOwn)}
                  >
                    {!isOwn && (
                      <Typography sx={shellStyles.senderLabel}>
                        {getSenderName(msg.sender)}
                      </Typography>
                    )}
                    <Box sx={shellStyles.bubble(isOwn)}>
                      {msg.type === 'file' ? (
                        <Box>
                          {isImageFile(msg.fileType) ? (
                            <Box sx={{ mb: 1 }}>
                              <img
                                src={msg.url || getIPFSFileUrl(msg.ipfsHash)}
                                alt={msg.fileName}
                                style={{
                                  maxWidth: '100%',
                                  maxHeight: 260,
                                  borderRadius: 10,
                                  display: 'block'
                                }}
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  const fallback =
                                    e.target.nextSibling;
                                  if (fallback) {
                                    fallback.style.display = 'block';
                                  }
                                }}
                              />
                              <Box
                                sx={{
                                  display: 'none',
                                  color: '#fecaca',
                                  fontSize: 12
                                }}
                              >
                                ⚠️ Image failed to load
                              </Box>
                            </Box>
                          ) : null}
                          <Typography
                            sx={{
                              fontSize: 14,
                              fontWeight: 600,
                              mb: 0.5
                            }}
                          >
                            {msg.fileName}
                          </Typography>
                          {msg.fileSize && (
                            <Typography
                              sx={{
                                fontSize: 11,
                                color: 'rgba(255,255,255,0.7)',
                                mb: 0.5
                              }}
                            >
                              {(msg.fileSize / 1024).toFixed(2)} KB
                            </Typography>
                          )}
                          <a
                            href={
                              msg.url || getIPFSFileUrl(msg.ipfsHash)
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: '#f97316',
                              textDecoration: 'underline',
                              fontSize: 13
                            }}
                          >
                            📥 Open / Download
                          </a>
                        </Box>
                      ) : (
                        <Typography sx={shellStyles.messageText}>
                          {msg.content}
                        </Typography>
                      )}
                    </Box>
                    <Typography sx={shellStyles.timeLabel}>
                      {formatDistanceToNow(ts, { addSuffix: true })}
                    </Typography>
                  </ListItem>
                );
              })}
              <div ref={messagesEndRef} />
            </List>
          )}
        </Box>

        {/* Input + file area */}
        <Box sx={shellStyles.inputShell}>
          {selectedFile && (
            <Box sx={shellStyles.filePreviewRow}>
              {filePreview ? (
                <img
                  src={filePreview}
                  alt="preview"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 8,
                    objectFit: 'cover'
                  }}
                />
              ) : (
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: 8,
                    background: 'rgba(255,60,0,0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24
                  }}
                >
                  📄
                </Box>
              )}
              <Box sx={{ flex: 1 }}>
                <Typography
                  sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}
                >
                  {selectedFile.name}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.7)'
                  }}
                >
                  {(selectedFile.size / 1024).toFixed(2)} KB
                </Typography>
              </Box>
              <IconButton
                onClick={handleClearFile}
                sx={{ color: '#ef4444' }}
              >
                <CloseIcon />
              </IconButton>
              {!loading && (
                <Button
                  variant="contained"
                  onClick={handleSendFile}
                  sx={{
                    background:
                      'linear-gradient(135deg, #ff8c42 0%, #ff6b35 100%)',
                    color: '#000000',
                    fontWeight: 600
                  }}
                >
                  Send File
                </Button>
              )}
              {loading && (
                <Typography
                  sx={{
                    fontSize: 11,
                    color: '#fb923c',
                    minWidth: 40
                  }}
                >
                  {uploadProgress}%
                </Typography>
              )}
            </Box>
          )}

          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            accept="image/*,.pdf,.doc,.docx,.txt"
          />

          <Box sx={shellStyles.inputRow}>
            <Tooltip title="Attach file (IPFS + on-chain metadata)">
              <span>
                <IconButton
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  sx={{
                    color: loading ? '#4b5563' : '#ff8c42',
                    backgroundColor: 'rgba(255,140,66,0.16)'
                  }}
                >
                  <AttachFileIcon />
                </IconButton>
              </span>
            </Tooltip>

            <TextField
              fullWidth
              placeholder="Send a message to everyone in this group…"
              size="small"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !loading) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              InputProps={{
                sx: {
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 12,
                  '& fieldset': {
                    borderColor: 'rgba(255,40,0,0.25)'
                  },
                  '&:hover fieldset': {
                    borderColor: 'rgba(255,60,0,0.5)'
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: 'rgba(255,60,0,0.85)'
                  }
                }
              }}
            />

            <Tooltip title="Send message (IPFS + on-chain)">
              <span>
                <button
                  style={{
                    ...shellStyles.sendButton,
                    opacity:
                      loading || !message.trim() ? 0.5 : 1,
                    cursor:
                      loading || !message.trim()
                        ? 'not-allowed'
                        : 'pointer'
                  }}
                  onClick={handleSendMessage}
                  disabled={loading || !message.trim()}
                >
                  {loading ? (
                    <CircularProgress
                      size={22}
                      sx={{ color: '#ff3300' }}
                    />
                  ) : (
                    <SendIcon sx={{ color: '#000000' }} />
                  )}
                </button>
              </span>
            </Tooltip>
          </Box>
        </Box>
      </div>
    </div>
  );
}

export default GroupChat;