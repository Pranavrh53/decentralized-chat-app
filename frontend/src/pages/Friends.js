import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { initWeb3, getWeb3, getDynamicGasPrice } from '../utils/blockchain';
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
  VisibilityOff,
  Link as LinkIcon,
  Storage as StorageIcon
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
          console.log('📋 Blockchain friends:', blockchainFriends.map(f => ({ name: f.name, address: f.address })));
        } catch (err) {
          console.error('Error loading from blockchain:', err);
        }
      }
      
      // Load friends from localStorage (imported or cached)
      const normalizedAddress = walletAddress.toLowerCase();
      // Try both normalized and original case keys for backward compatibility
      let localFriends = JSON.parse(localStorage.getItem(`friends_${normalizedAddress}`) || '[]');
      if (localFriends.length === 0) {
        localFriends = JSON.parse(localStorage.getItem(`friends_${walletAddress}`) || '[]');
      }
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
      
      // IMPORTANT: Sync merged friends back to localStorage so Chat.js and other
      // pages can find the complete friends list (including blockchain friends)
      // This fixes the bug where friends appear in the friends list but not in chat
      // after re-login, because Chat.js reads friends from localStorage.
      const friendsToStore = mergedFriends.map(f => ({
        address: f.address,
        name: f.name,
        addedAt: f.addedAt || new Date().toISOString(),
        source: f.source
      }));
      localStorage.setItem(`friends_${normalizedAddress}`, JSON.stringify(friendsToStore));
      // Also store with original case for backward compatibility
      localStorage.setItem(`friends_${walletAddress}`, JSON.stringify(friendsToStore));
      console.log(`💾 Synced ${friendsToStore.length} friends to localStorage`);
      
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
      const web3 = getWeb3();
      
      // Check if friend already exists on blockchain
      try {
        const existingFriend = await contract.methods.getFriend(walletAddress, newFriendAddress.trim()).call();
        if (existingFriend.exists) {
          console.log('⚠️ Friend already exists on blockchain:', existingFriend);
          setError('This friend already exists on the blockchain. Remove them first before re-adding.');
          setLoading(false);
          return;
        }
        console.log('✅ Friend check passed - not on blockchain yet');
      } catch (checkErr) {
        // Friend doesn't exist or error checking, continue
        console.log('Friend check:', checkErr.message || 'continuing...');
      }
      
      const gasPrice = await getDynamicGasPrice(1.3);
      
      // Estimate gas first to catch reverts early
      let estimatedGas;
      try {
        estimatedGas = await contract.methods
          .addFriend(newFriendAddress.trim(), newFriendName.trim())
          .estimateGas({ from: walletAddress });
        console.log(`Estimated gas: ${estimatedGas}`);
      } catch (estimateErr) {
        console.error('Gas estimation failed:', estimateErr);
        
        // Parse the revert reason
        let errorMessage = 'Transaction will fail. ';
        if (estimateErr.message.includes('Friend already exists')) {
          errorMessage += 'This friend is already in your list.';
        } else if (estimateErr.message.includes('Cannot add yourself')) {
          errorMessage += 'You cannot add yourself as a friend.';
        } else if (estimateErr.message.includes('Invalid friend address')) {
          errorMessage += 'Invalid wallet address.';
        } else if (estimateErr.message.includes('Name cannot be empty')) {
          errorMessage += 'Friend name cannot be empty.';
        } else {
          errorMessage += estimateErr.message;
        }
        
        setError(errorMessage);
        setLoading(false);
        return;
      }
      
      // Convert estimatedGas to number and add 20% buffer
      const gasLimit = Math.floor(Number(estimatedGas) * 1.2);
      console.log(`Using gas limit: ${gasLimit}`);
      
      const tx = await contract.methods
        .addFriend(newFriendAddress.trim(), newFriendName.trim())
        .send({ 
          from: walletAddress,
          gas: gasLimit,
          gasPrice: gasPrice
        });

      console.log('✅ Friend added! Transaction:', tx.transactionHash);
      
      // Also save to localStorage as backup
      const newFriend = {
        address: newFriendAddress.trim(),
        name: newFriendName.trim(),
        addedAt: new Date().toISOString()
      };
      
      const normalizedAddress = walletAddress.toLowerCase();
      const localFriends = JSON.parse(localStorage.getItem(`friends_${normalizedAddress}`) || '[]');
      localFriends.push(newFriend);
      localStorage.setItem(`friends_${normalizedAddress}`, JSON.stringify(localFriends));
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
      
      // Better error messages
      let errorMessage = 'Failed to add friend: ';
      if (error.message.includes('User denied')) {
        errorMessage = 'Transaction cancelled by user.';
      } else if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds for gas fees. Please add test ETH to your wallet.';
      } else if (error.message.includes('Friend already exists')) {
        errorMessage = 'This friend is already in your list on the blockchain.';
      } else if (error.message.includes('reverted')) {
        errorMessage = 'Transaction failed. The friend might already exist, or there may be a validation issue.';
      } else {
        errorMessage += error.message;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFriend = async (friend) => {
    const isBlockchain = friend.source === 'blockchain';
    const friendAddress = friend.address;
    
    // Different confirmation messages based on source
    const confirmMessage = isBlockchain
      ? `Remove "${friend.name}" from blockchain? This will require a transaction and gas fees.`
      : `Remove "${friend.name}" from local storage? This action is instant and free.`;
    
    if (!window.confirm(confirmMessage)) return;
    
    setLoading(true);
    try {
      if (isBlockchain) {
        // Remove from blockchain (requires transaction)
        if (!contract) {
          setError('Contract not initialized');
          return;
        }
        
        console.log(`🔗 Removing friend from blockchain...`);
        const web3 = getWeb3();
        const gasPrice = await getDynamicGasPrice(1.3);
        
        const tx = await contract.methods
          .removeFriend(friendAddress)
          .send({ 
            from: walletAddress,
            gas: 100000,
            gasPrice: gasPrice
          });

        console.log('✅ Friend removed from blockchain! Transaction:', tx.transactionHash);
      } else {
        // Remove from localStorage only (instant, no transaction)
        console.log(`💾 Removing friend from localStorage...`);
      }
      
      // Always remove from localStorage
      const normalizedAddress = walletAddress.toLowerCase();
      let localFriends = JSON.parse(localStorage.getItem(`friends_${normalizedAddress}`) || '[]');
      if (localFriends.length === 0) {
        localFriends = JSON.parse(localStorage.getItem(`friends_${walletAddress}`) || '[]');
      }
      
      const updatedLocal = localFriends.filter(
        f => {
          const addr = typeof f === 'string' ? f : f.address;
          return addr && addr.toLowerCase() !== friendAddress.toLowerCase();
        }
      );
      localStorage.setItem(`friends_${normalizedAddress}`, JSON.stringify(updatedLocal));
      localStorage.setItem(`friends_${walletAddress}`, JSON.stringify(updatedLocal));
      
      console.log('✅ Friend removed successfully!');
      
      // Reload friends
      await loadFriends();
    } catch (error) {
      console.error('Error removing friend:', error);
      setError(`Failed to remove friend: ${error.message}`);
    } finally {
      setLoading(false);
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

        {/* Storage Statistics */}
        {friends.length > 0 && (
          <Box sx={{ 
            display: 'flex', 
            gap: 2, 
            mb: 3,
            flexWrap: 'wrap'
          }}>
            <Paper sx={{
              flex: 1,
              minWidth: '200px',
              p: 2,
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '12px'
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <LinkIcon sx={{ color: '#10b981', fontSize: 20 }} />
                <Typography sx={{ color: '#10b981', fontWeight: 600, fontSize: '14px' }}>
                  On-Chain Friends
                </Typography>
              </Box>
              <Typography sx={{ color: '#ffffff', fontSize: '28px', fontWeight: 700 }}>
                {friends.filter(f => f.source === 'blockchain').length}
              </Typography>
              <Typography sx={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '12px', mt: 0.5 }}>
                Stored on blockchain • Requires gas to remove
              </Typography>
            </Paper>
            
            <Paper sx={{
              flex: 1,
              minWidth: '200px',
              p: 2,
              background: 'linear-gradient(135deg, rgba(255, 140, 66, 0.1) 0%, rgba(255, 140, 66, 0.05) 100%)',
              border: '1px solid rgba(255, 140, 66, 0.3)',
              borderRadius: '12px'
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <StorageIcon sx={{ color: '#ff8c42', fontSize: 20 }} />
                <Typography sx={{ color: '#ff8c42', fontWeight: 600, fontSize: '14px' }}>
                  Local Friends
                </Typography>
              </Box>
              <Typography sx={{ color: '#ffffff', fontSize: '28px', fontWeight: 700 }}>
                {friends.filter(f => f.source === 'imported').length}
              </Typography>
              <Typography sx={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '12px', mt: 0.5 }}>
                Imported from backup • Free to remove
              </Typography>
            </Paper>
          </Box>
        )}

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
                        <Tooltip 
                          title={friend.source === 'blockchain' 
                            ? 'Remove from blockchain (requires transaction)' 
                            : 'Remove from local storage (instant, no gas)'}
                        >
                          <IconButton
                            edge="end"
                            color="error"
                            onClick={() => handleDeleteFriend(friend)}
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
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="h6" sx={{ color: '#ffffff', fontWeight: 600 }}>
                            {friend.name}
                          </Typography>
                          <Tooltip 
                            title={friend.source === 'blockchain' 
                              ? 'Stored on blockchain (decentralized, requires gas to remove)' 
                              : 'Stored locally (imported, can be removed instantly)'}
                          >
                            <Chip
                              icon={friend.source === 'blockchain' ? <LinkIcon /> : <StorageIcon />}
                              label={friend.source === 'blockchain' ? 'On-Chain' : 'Local'}
                              size="small"
                              sx={{
                                backgroundColor: friend.source === 'blockchain' 
                                  ? 'rgba(16, 185, 129, 0.2)' 
                                  : 'rgba(255, 140, 66, 0.2)',
                                color: friend.source === 'blockchain' ? '#10b981' : '#ff8c42',
                                fontWeight: 600,
                                fontSize: '10px',
                                height: '20px',
                                '& .MuiChip-icon': {
                                  fontSize: '14px',
                                  color: friend.source === 'blockchain' ? '#10b981' : '#ff8c42'
                                }
                              }}
                            />
                          </Tooltip>
                        </Box>
                      }
                      secondary={
                        <Box sx={{ mt: 1 }} component="div">
                          <Typography
                            variant="body2"
                            component="span"
                            sx={{
                              color: '#b8b8d1',
                              fontFamily: 'monospace',
                              fontSize: '13px',
                              display: 'block'
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
            <Alert 
              severity="error" 
              sx={{ 
                mb: 2,
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                color: '#ef4444',
                '& .MuiAlert-icon': {
                  color: '#ef4444'
                }
              }}
            >
              {error}
            </Alert>
          )}
          <Alert severity="info" sx={{ mb: 2 }}>
            💡 <strong>Common Issues:</strong><br/>
            • Friend already exists - Remove them first<br/>
            • Insufficient gas - Get test ETH from <a href="https://sepoliafaucet.com" target="_blank" rel="noopener" style={{color: '#8a66ff'}}>Sepolia Faucet</a><br/>
            • Invalid address - Check the wallet address format
          </Alert>
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
