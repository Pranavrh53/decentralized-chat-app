import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { initWeb3, getWeb3 } from '../utils/blockchain';
import ChatMetadataABI from '../abis/ChatMetadata.json';
import { 
  exportChatHistory, 
  importChatHistory, 
  downloadExportFile, 
  readImportFile,
  validatePassword
} from '../utils/exportImport';
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
  Avatar,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Tooltip,
  Chip,
  CircularProgress,
  Alert,
  LinearProgress,
  InputAdornment,
  Menu,
  MenuItem
} from '@mui/material';
import {
  PersonAdd as PersonAddIcon,
  Chat as ChatIcon,
  Delete as DeleteIcon,
  AccountCircle,
  Download as DownloadIcon,
  Upload as UploadIcon,
  Lock as LockIcon,
  Visibility,
  VisibilityOff
} from '@mui/icons-material';

const Friends = ({ walletAddress, onLogout }) => {
  const navigate = useNavigate();
  const [friends, setFriends] = useState([]);
  const [newFriendAddress, setNewFriendAddress] = useState('');
  const [newFriendName, setNewFriendName] = useState('');
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [contract, setContract] = useState(null);
  const username = localStorage.getItem('username') || 'Anonymous';

  // Export/Import state
  const [openExportDialog, setOpenExportDialog] = useState(false);
  const [openImportDialog, setOpenImportDialog] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0, message: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [importSuccess, setImportSuccess] = useState(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedFriend, setSelectedFriend] = useState(null);

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
    
    if (walletAddress) {
      setupContract();
    }
  }, [walletAddress]);

  useEffect(() => {
    if (walletAddress && contract) {
      loadFriends();
    }
  }, [walletAddress, contract]);

  const loadFriends = async () => {
    if (!walletAddress) return;
    
    setLoading(true);
    try {
      let blockchainFriends = [];
      
      // Try to load from blockchain if contract is available
      if (contract) {
        try {
          console.log('Loading friends from blockchain...');
          const friendAddresses = await contract.methods.getFriends(walletAddress).call();
          
          // Get detailed information for each friend
          const friendsData = await Promise.all(
            friendAddresses.map(async (friendAddress) => {
              const friendData = await contract.methods.getFriend(walletAddress, friendAddress).call();
              return {
                address: friendData.friendAddress.toLowerCase(),
                name: friendData.name,
                addedAt: new Date(Number(friendData.addedAt) * 1000).toISOString(),
                exists: friendData.exists,
                source: 'blockchain'
              };
            })
          );
          
          blockchainFriends = friendsData.filter(f => f.exists);
          console.log(`✅ Loaded ${blockchainFriends.length} friends from blockchain`);
        } catch (err) {
          console.error('Error loading from blockchain:', err);
        }
      }
      
      // Load friends from localStorage (imported or cached)
      const normalizedAddress = walletAddress.toLowerCase();
      const localFriends = JSON.parse(localStorage.getItem(`friends_${normalizedAddress}`) || '[]');
      console.log(`📦 Found ${localFriends.length} friends in localStorage`);
      
      // Merge blockchain and localStorage friends (deduplicate by address)
      const mergedFriendsMap = new Map();
      
      // Add blockchain friends first (they have priority)
      blockchainFriends.forEach(friend => {
        mergedFriendsMap.set(friend.address.toLowerCase(), friend);
      });
      
      // Add localStorage friends (won't override blockchain friends)
      localFriends.forEach(friend => {
        const addr = friend.address.toLowerCase();
        if (!mergedFriendsMap.has(addr)) {
          mergedFriendsMap.set(addr, {
            ...friend,
            address: addr,
            source: 'imported'
          });
        }
      });
      
      const mergedFriends = Array.from(mergedFriendsMap.values());
      setFriends(mergedFriends);
      console.log(`✅ Total friends after merge: ${mergedFriends.length}`);
      
    } catch (error) {
      console.error('Error loading friends:', error);
      setError('Failed to load friends');
    } finally {
      setLoading(false);
    }
  };

  const handleAddFriend = async () => {
    setError('');
    
    if (!walletAddress) {
      setError('Wallet not connected');
      return;
    }
    
    if (!contract) {
      setError('Blockchain not connected. Please refresh the page.');
      return;
    }
    
    // Validation
    if (!newFriendAddress.trim()) {
      setError('Please enter a wallet address');
      return;
    }
    
    if (!newFriendName.trim()) {
      setError('Please enter a name for your friend');
      return;
    }

    // Check if address is valid (basic check)
    if (!newFriendAddress.startsWith('0x') || newFriendAddress.length !== 42) {
      setError('Invalid wallet address format');
      return;
    }

    // Check if adding self
    if (newFriendAddress.toLowerCase() === walletAddress.toLowerCase()) {
      setError('You cannot add yourself as a friend');
      return;
    }

    // Check if friend already exists
    const existingFriend = friends.find(
      f => f.address.toLowerCase() === newFriendAddress.toLowerCase()
    );
    
    if (existingFriend) {
      setError('This address is already in your friends list');
      return;
    }

    // Add friend to blockchain
    setLoading(true);
    try {
      console.log(`Adding friend ${newFriendName} to blockchain...`);
      
      const tx = await contract.methods
        .addFriend(newFriendAddress.trim(), newFriendName.trim())
        .send({ from: walletAddress });

      console.log('✅ Friend added! Transaction:', tx.transactionHash);
      
      // Also save to localStorage as backup
      const newFriend = {
        address: newFriendAddress.trim(),
        name: newFriendName.trim(),
        addedAt: new Date().toISOString()
      };
      
      const localFriends = JSON.parse(localStorage.getItem(`friends_${walletAddress}`) || '[]');
      localFriends.push(newFriend);
      localStorage.setItem(`friends_${walletAddress}`, JSON.stringify(localFriends));

      // Reload friends from blockchain
      await loadFriends();

      // Reset form
      setNewFriendAddress('');
      setNewFriendName('');
      setOpenAddDialog(false);
      setError('');
    } catch (error) {
      console.error('Error adding friend:', error);
      setError(`Failed to add friend: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFriend = async (friendAddress) => {
    if (!walletAddress || !contract) return;
    
    if (window.confirm('Are you sure you want to remove this friend?')) {
      setLoading(true);
      try {
        console.log(`Removing friend from blockchain...`);
        
        const tx = await contract.methods
          .removeFriend(friendAddress)
          .send({ from: walletAddress });

        console.log('✅ Friend removed! Transaction:', tx.transactionHash);
        
        // Also remove from localStorage
        const localFriends = JSON.parse(localStorage.getItem(`friends_${walletAddress}`) || '[]');
        const updatedLocal = localFriends.filter(
          f => {
            const addr = typeof f === 'string' ? f : f.address;
            return addr && addr.toLowerCase() !== friendAddress.toLowerCase();
          }
        );
        localStorage.setItem(`friends_${walletAddress}`, JSON.stringify(updatedLocal));
        
        // Reload friends from blockchain
        await loadFriends();
      } catch (error) {
        console.error('Error removing friend:', error);
        setError(`Failed to remove friend: ${error.message}`);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleStartChat = (friend) => {
    navigate(`/chat/${friend.address}`);
  };

  // Export chat history
  const handleExport = async () => {
    setError('');
    setExportSuccess(false);
    
    const validation = validatePassword(exportPassword);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }

    setLoading(true);
    try {
      console.log('🚀 Starting export...');
      
      const encrypted = await exportChatHistory(
        walletAddress,
        exportPassword,
        (current, total, message) => {
          setExportProgress({ current, total, message });
        }
      );

      // Download the file
      const filename = downloadExportFile(encrypted, walletAddress);
      
      setExportSuccess(true);
      setError('');
      console.log(`✅ Export complete: ${filename}`);
      
      // Reset after 3 seconds
      setTimeout(() => {
        setOpenExportDialog(false);
        setExportPassword('');
        setExportSuccess(false);
        setExportProgress({ current: 0, total: 0, message: '' });
      }, 3000);
      
    } catch (err) {
      console.error('Export error:', err);
      setError(`Export failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Import chat history
  const handleImport = async () => {
    setError('');
    setImportSuccess(null);
    
    if (!importFile) {
      setError('Please select a file to import');
      return;
    }

    const validation = validatePassword(importPassword);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }

    setLoading(true);
    try {
      console.log('🚀 Starting import...');
      
      // Read the file
      const fileContent = await readImportFile(importFile);
      
      // Import and decrypt
      const result = await importChatHistory(
        fileContent,
        importPassword,
        walletAddress
      );

      setImportSuccess(result);
      setError('');
      console.log('✅ Import complete:', result);
      
      // Reload friends to show imported data
      await loadFriends();
      
      // Reset after 5 seconds
      setTimeout(() => {
        setOpenImportDialog(false);
        setImportPassword('');
        setImportFile(null);
        setImportSuccess(null);
      }, 5000);
      
    } catch (err) {
      console.error('Import error:', err);
      setError(`Import failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setImportFile(file);
      setError('');
    }
  };

  const getAvatarEmoji = (name) => {
    if (!name) return '👤';
    const emojis = ['👨', '👩', '🧑', '👦', '👧', '🧔', '👴', '👵', '👨‍💼', '👩‍💼', '🧑‍💻', '👨‍🎓', '👩‍🎓'];
    const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % emojis.length;
    return emojis[index];
  };

  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #2d1b4e 100%)',
    },
    content: {
      padding: '40px',
      maxWidth: '1200px',
      margin: '0 auto',
    },
    header: {
      marginBottom: '40px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    title: {
      fontSize: '42px',
      fontWeight: '700',
      color: '#ffffff',
      marginBottom: '10px',
      textShadow: '0 0 20px rgba(138, 102, 255, 0.5)'
    },
    subtitle: {
      fontSize: '16px',
      color: '#b8b8d1'
    },
    addButton: {
      background: 'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)',
      color: '#ffffff',
      padding: '12px 30px',
      borderRadius: '12px',
      fontWeight: '600',
      fontSize: '16px',
      textTransform: 'none',
      boxShadow: '0 4px 15px rgba(138, 102, 255, 0.4)',
      '&:hover': {
        background: 'linear-gradient(135deg, #9d7aff 0%, #7755dd 100%)',
        boxShadow: '0 6px 20px rgba(138, 102, 255, 0.6)',
      }
    },
    friendsList: {
      background: 'linear-gradient(135deg, #1a1f3a 0%, #2d1b4e 100%)',
      borderRadius: '20px',
      border: '1px solid rgba(138, 102, 255, 0.2)',
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
      overflow: 'hidden'
    },
    friendItem: {
      padding: '20px',
      transition: 'all 0.3s ease',
      '&:hover': {
        backgroundColor: 'rgba(138, 102, 255, 0.1)',
      }
    },
    emptyState: {
      textAlign: 'center',
      padding: '60px 20px',
      color: '#b8b8d1'
    },
    avatar: {
      width: '56px',
      height: '56px',
      background: 'linear-gradient(135deg, #ff8c42 0%, #ff6b35 100%)',
      fontSize: '28px',
      boxShadow: '0 4px 12px rgba(255, 140, 66, 0.4)',
    }
  };

  if (!walletAddress) {
    return (
      <div style={styles.container}>
        <Navbar walletAddress={walletAddress} username={username} onLogout={onLogout} />
        <div style={styles.content}>
          <Box sx={{ textAlign: 'center', py: 8, color: '#b8b8d1' }}>
            <Typography variant="h5">Loading wallet...</Typography>
          </Box>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <Navbar walletAddress={walletAddress} username={username} onLogout={onLogout} />
      
      <div style={styles.content}>
        <Box style={styles.header}>
          <Box>
            <Typography style={styles.title}>
              👥 Friends
              {contract && (
                <Chip 
                  label="⛓️ Blockchain" 
                  size="small"
                  sx={{ 
                    ml: 2, 
                    backgroundColor: 'rgba(74, 222, 128, 0.2)', 
                    color: '#4ade80',
                    fontWeight: 600
                  }} 
                />
              )}
            </Typography>
            <Typography style={styles.subtitle}>
              {contract ? 'Friends stored on blockchain (decentralized)' : 'Manage your chat friends'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Tooltip title="Export your complete chat history">
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={() => setOpenExportDialog(true)}
                sx={{
                  borderColor: 'rgba(138, 102, 255, 0.5)',
                  color: '#8a66ff',
                  padding: '10px 24px',
                  borderRadius: '12px',
                  fontWeight: '600',
                  '&:hover': {
                    borderColor: '#8a66ff',
                    backgroundColor: 'rgba(138, 102, 255, 0.1)',
                  }
                }}
                disabled={loading}
              >
                Export
              </Button>
            </Tooltip>
            <Tooltip title="Import chat history from backup">
              <Button
                variant="outlined"
                startIcon={<UploadIcon />}
                onClick={() => setOpenImportDialog(true)}
                sx={{
                  borderColor: 'rgba(74, 222, 128, 0.5)',
                  color: '#4ade80',
                  padding: '10px 24px',
                  borderRadius: '12px',
                  fontWeight: '600',
                  '&:hover': {
                    borderColor: '#4ade80',
                    backgroundColor: 'rgba(74, 222, 128, 0.1)',
                  }
                }}
                disabled={loading}
              >
                Import
              </Button>
            </Tooltip>
            <Button
              variant="contained"
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <PersonAddIcon />}
              onClick={() => setOpenAddDialog(true)}
              sx={styles.addButton}
              disabled={loading || !contract}
            >
              Add Friend
            </Button>
          </Box>
        </Box>

        <Paper sx={styles.friendsList}>
          {friends.length > 0 ? (
            <List>
              {friends.map((friend, index) => (
                <React.Fragment key={friend.address}>
                  <ListItem
                    sx={styles.friendItem}
                    secondaryAction={
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title="Start Chat">
                          <IconButton
                            edge="end"
                            color="primary"
                            onClick={() => handleStartChat(friend)}
                          >
                            <ChatIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Remove Friend">
                          <IconButton
                            edge="end"
                            color="error"
                            onClick={() => handleDeleteFriend(friend.address)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    }
                  >
                    <ListItemAvatar>
                      <Avatar sx={styles.avatar}>
                        {getAvatarEmoji(friend.name)}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Typography variant="h6" sx={{ color: '#ffffff', fontWeight: 600 }}>
                          {friend.name}
                        </Typography>
                      }
                      secondary={
                        <Box sx={{ mt: 1 }}>
                          <Typography
                            variant="body2"
                            sx={{
                              color: '#b8b8d1',
                              fontFamily: 'monospace',
                              fontSize: '13px'
                            }}
                          >
                            {friend.address}
                          </Typography>
                          <Chip
                            label={`Added ${new Date(friend.addedAt).toLocaleDateString()}`}
                            size="small"
                            sx={{
                              mt: 1,
                              backgroundColor: 'rgba(138, 102, 255, 0.2)',
                              color: '#b8b8d1',
                              fontSize: '11px'
                            }}
                          />
                        </Box>
                      }
                    />
                  </ListItem>
                  {index < friends.length - 1 && <Divider variant="inset" component="li" />}
                </React.Fragment>
              ))}
            </List>
          ) : (
            <Box sx={styles.emptyState}>
              <AccountCircle sx={{ fontSize: 80, color: '#4a4a6a', mb: 2 }} />
              <Typography variant="h6" sx={{ mb: 1 }}>
                No Friends Yet
              </Typography>
              <Typography variant="body2">
                Click "Add Friend" to start adding friends by their wallet address
              </Typography>
            </Box>
          )}
        </Paper>
      </div>

      {/* Add Friend Dialog */}
      <Dialog
        open={openAddDialog}
        onClose={() => {
          setOpenAddDialog(false);
          setError('');
          setNewFriendAddress('');
          setNewFriendName('');
        }}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            background: 'linear-gradient(135deg, #1a1f3a 0%, #2d1b4e 100%)',
            border: '1px solid rgba(138, 102, 255, 0.3)',
          }
        }}
      >
        <DialogTitle sx={{ color: '#ffffff', fontWeight: 600 }}>
          Add New Friend
        </DialogTitle>
        <DialogContent>
          {error && (
            <Paper
              sx={{
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                color: '#ef4444',
                p: 2,
                mb: 2,
                borderRadius: 1
              }}
            >
              {error}
            </Paper>
          )}
          <TextField
            autoFocus
            margin="dense"
            label="Friend's Name"
            type="text"
            fullWidth
            variant="outlined"
            value={newFriendName}
            onChange={(e) => setNewFriendName(e.target.value)}
            placeholder="Enter a name for your friend"
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Wallet Address"
            type="text"
            fullWidth
            variant="outlined"
            value={newFriendAddress}
            onChange={(e) => setNewFriendAddress(e.target.value)}
            placeholder="0x..."
          />
          {loading && (
            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={20} />
              <Typography variant="body2" sx={{ color: '#b8b8d1' }}>
                Waiting for blockchain transaction...
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button
            onClick={() => {
              setOpenAddDialog(false);
              setError('');
              setNewFriendAddress('');
              setNewFriendName('');
            }}
            sx={{ color: '#b8b8d1' }}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAddFriend}
            variant="contained"
            disabled={loading}
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
            sx={{
              background: 'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #9d7aff 0%, #7755dd 100%)',
              }
            }}
          >
            Add Friend
          </Button>
        </DialogActions>
      </Dialog>

      {/* Export Dialog */}
      <Dialog
        open={openExportDialog}
        onClose={() => {
          if (!loading) {
            setOpenExportDialog(false);
            setExportPassword('');
            setError('');
            setExportSuccess(false);
            setExportProgress({ current: 0, total: 0, message: '' });
          }
        }}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            background: 'linear-gradient(135deg, #1a1f3a 0%, #2d1b4e 100%)',
            border: '1px solid rgba(138, 102, 255, 0.3)',
          }
        }}
      >
        <DialogTitle sx={{ color: '#ffffff', fontWeight: 600 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DownloadIcon />
            Export Chat History
          </Box>
        </DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {exportSuccess && (
            <Alert severity="success" sx={{ mb: 2 }}>
              ✅ Export successful! File downloaded to your computer.
            </Alert>
          )}
          
          <Typography variant="body2" sx={{ color: '#b8b8d1', mb: 3 }}>
            💾 Export your complete chat history as an encrypted file. You can import it on any device or browser.
          </Typography>

          <Box sx={{ mb: 2, p: 2, backgroundColor: 'rgba(138, 102, 255, 0.1)', borderRadius: 2 }}>
            <Typography variant="body2" sx={{ color: '#8a66ff', fontWeight: 600, mb: 1 }}>
              🔒 What will be exported:
            </Typography>
            <Typography variant="body2" sx={{ color: '#b8b8d1', fontSize: '13px' }}>
              • All your friends ({friends.length} friends)<br />
              • All message history<br />
              • Your username and settings<br />
              • Encrypted with AES-256
            </Typography>
          </Box>

          <TextField
            fullWidth
            type={showPassword ? 'text' : 'password'}
            label="Encryption Password"
            value={exportPassword}
            onChange={(e) => setExportPassword(e.target.value)}
            placeholder="Min. 8 characters (12+ recommended)"
            variant="outlined"
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LockIcon sx={{ color: '#8a66ff' }} />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword(!showPassword)}
                    edge="end"
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            disabled={loading}
          />

          <Alert severity="warning" sx={{ mb: 2 }}>
            ⚠️ Remember this password! You'll need it to import your data later.
          </Alert>

          {loading && (
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" sx={{ color: '#b8b8d1' }}>
                  {exportProgress.message}
                </Typography>
                <Typography variant="body2" sx={{ color: '#8a66ff' }}>
                  {exportProgress.current}/{exportProgress.total}
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={(exportProgress.current / exportProgress.total) * 100} 
                sx={{
                  backgroundColor: 'rgba(138, 102, 255, 0.2)',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: '#8a66ff'
                  }
                }}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button
            onClick={() => {
              setOpenExportDialog(false);
              setExportPassword('');
              setError('');
              setExportSuccess(false);
            }}
            sx={{ color: '#b8b8d1' }}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            variant="contained"
            disabled={loading || !exportPassword}
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <DownloadIcon />}
            sx={{
              background: 'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #9d7aff 0%, #7755dd 100%)',
              }
            }}
          >
            {loading ? 'Exporting...' : 'Export Now'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Import Dialog */}
      <Dialog
        open={openImportDialog}
        onClose={() => {
          if (!loading) {
            setOpenImportDialog(false);
            setImportPassword('');
            setImportFile(null);
            setError('');
            setImportSuccess(null);
          }
        }}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            background: 'linear-gradient(135deg, #1a1f3a 0%, #2d1b4e 100%)',
            border: '1px solid rgba(74, 222, 128, 0.3)',
          }
        }}
      >
        <DialogTitle sx={{ color: '#ffffff', fontWeight: 600 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <UploadIcon />
            Import Chat History
          </Box>
        </DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {importSuccess && (
            <Alert severity="success" sx={{ mb: 2 }}>
              ✅ Import successful!<br />
              • {importSuccess.friendsCount} friends imported<br />
              • {importSuccess.messagesCount} messages restored<br />
              • {importSuccess.conversationsCount} conversations
            </Alert>
          )}

          <Typography variant="body2" sx={{ color: '#b8b8d1', mb: 3 }}>
            📤 Import your chat history from a backup file. Your data will be restored to this device.
          </Typography>

          <Box sx={{ mb: 3 }}>
            <Button
              variant="outlined"
              component="label"
              fullWidth
              sx={{
                borderColor: 'rgba(74, 222, 128, 0.5)',
                color: '#4ade80',
                padding: '16px',
                borderRadius: '12px',
                borderStyle: 'dashed',
                '&:hover': {
                  borderColor: '#4ade80',
                  backgroundColor: 'rgba(74, 222, 128, 0.1)',
                }
              }}
              disabled={loading}
            >
              <Box sx={{ textAlign: 'center' }}>
                <UploadIcon sx={{ fontSize: 40, mb: 1 }} />
                <Typography variant="body1">
                  {importFile ? importFile.name : 'Click to select backup file'}
                </Typography>
                {importFile && (
                  <Typography variant="caption" sx={{ color: '#b8b8d1', mt: 1 }}>
                    File size: {(importFile.size / 1024).toFixed(2)} KB
                  </Typography>
                )}
              </Box>
              <input
                type="file"
                hidden
                accept=".encrypted"
                onChange={handleFileSelect}
              />
            </Button>
          </Box>

          {importFile && (
            <>
              <TextField
                fullWidth
                type={showPassword ? 'text' : 'password'}
                label="Decryption Password"
                value={importPassword}
                onChange={(e) => setImportPassword(e.target.value)}
                placeholder="Enter the password you used for export"
                variant="outlined"
                sx={{ mb: 2 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon sx={{ color: '#4ade80' }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                disabled={loading}
              />

              <Alert severity="info" sx={{ mb: 2 }}>
                ℹ️ This will merge the imported data with your existing friends and messages.
              </Alert>
            </>
          )}

          {loading && (
            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={20} />
              <Typography variant="body2" sx={{ color: '#b8b8d1' }}>
                Importing and decrypting data...
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button
            onClick={() => {
              setOpenImportDialog(false);
              setImportPassword('');
              setImportFile(null);
              setError('');
              setImportSuccess(null);
            }}
            sx={{ color: '#b8b8d1' }}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            variant="contained"
            disabled={loading || !importFile || !importPassword}
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <UploadIcon />}
            sx={{
              background: 'linear-gradient(135deg, #4ade80 0%, #22c55e 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #5eea95 0%, #34d367 100%)',
              }
            }}
          >
            {loading ? 'Importing...' : 'Import Now'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default Friends;
