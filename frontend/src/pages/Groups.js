import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { initWeb3, getWeb3, getDynamicGasPrice } from '../utils/blockchain';
import ChatMetadataABI from '../abis/ChatMetadata.json';
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  FormControlLabel,
  Divider,
  Chip,
  CircularProgress,
  Alert
} from '@mui/material';
import {
  GroupAdd as GroupAddIcon,
  Chat as ChatIcon,
  People as PeopleIcon
} from '@mui/icons-material';

const Groups = ({ walletAddress, onLogout }) => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [friends, setFriends] = useState([]);
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [contract, setContract] = useState(null);
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
    
    if (walletAddress) {
      setupContract();
    }
  }, [walletAddress]);

  // Load groups and friends
  useEffect(() => {
    if (walletAddress && contract) {
      loadGroupsAndFriends();
    }
  }, [walletAddress, contract]);

  const loadGroupsAndFriends = async () => {
    setLoading(true);
    try {
      // Load friends first
      await loadFriends();
      
      // Load groups from blockchain
      const groupIds = await contract.methods.getUserGroups(walletAddress).call();
      
      const groupsData = await Promise.all(
        groupIds.map(async (groupId) => {
          const groupInfo = await contract.methods.getGroup(groupId).call();
          return {
            id: groupId,
            name: groupInfo.name,
            description: groupInfo.description,
            members: groupInfo.members,
            createdAt: new Date(Number(groupInfo.createdAt) * 1000).toISOString()
          };
        })
      );
      
      setGroups(groupsData);
      console.log(`✅ Loaded ${groupsData.length} groups`);
      
      // Also load from localStorage (for offline/imported groups)
      let localGroups = JSON.parse(localStorage.getItem(`groups_${walletAddress.toLowerCase()}`) || '[]');
      if (localGroups.length === 0) {
        localGroups = JSON.parse(localStorage.getItem(`groups_${walletAddress}`) || '[]');
      }
      if (localGroups.length > 0) {
        // Merge with blockchain groups
        const mergedGroups = [...groupsData];
        localGroups.forEach(localGroup => {
          if (!mergedGroups.find(g => g.id === localGroup.id)) {
            mergedGroups.push(localGroup);
          }
        });
        setGroups(mergedGroups);
      }
      
    } catch (error) {
      console.error('Error loading groups:', error);
      setError('Failed to load groups');
      
      // Fallback to localStorage
      let localGroups = JSON.parse(localStorage.getItem(`groups_${walletAddress.toLowerCase()}`) || '[]');
      if (localGroups.length === 0) {
        localGroups = JSON.parse(localStorage.getItem(`groups_${walletAddress}`) || '[]');
      }
      setGroups(localGroups);
    } finally {
      setLoading(false);
    }
  };

  const loadFriends = async () => {
    try {
      // Load from blockchain
      const friendAddresses = await contract.methods.getFriends(walletAddress).call();
      const friendsData = await Promise.all(
        friendAddresses.map(async (friendAddress) => {
          const friendData = await contract.methods.getFriend(walletAddress, friendAddress).call();
          return {
            address: friendData.friendAddress.toLowerCase(),
            name: friendData.name,
            exists: friendData.exists
          };
        })
      );
      
      const activeFriends = friendsData.filter(f => f.exists);
      
      // Load from localStorage (imported friends)
      const normalizedAddress = walletAddress.toLowerCase();
      // Try both normalized and original case keys for backward compatibility
      let localFriends = JSON.parse(localStorage.getItem(`friends_${normalizedAddress}`) || '[]');
      if (localFriends.length === 0) {
        localFriends = JSON.parse(localStorage.getItem(`friends_${walletAddress}`) || '[]');
      }
      
      // Merge friends
      const mergedFriendsMap = new Map();
      activeFriends.forEach(f => mergedFriendsMap.set(f.address, f));
      localFriends.forEach(f => mergedFriendsMap.set(f.address.toLowerCase(), f));
      
      setFriends(Array.from(mergedFriendsMap.values()));
    } catch (error) {
      console.error('Error loading friends:', error);
      // Fallback to localStorage
      const normalizedAddress = walletAddress.toLowerCase();
      let localFriends = JSON.parse(localStorage.getItem(`friends_${normalizedAddress}`) || '[]');
      if (localFriends.length === 0) {
        localFriends = JSON.parse(localStorage.getItem(`friends_${walletAddress}`) || '[]');
      }
      setFriends(localFriends);
    }
  };

  const handleCreateGroup = async () => {
    setError('');
    
    if (!newGroupName.trim()) {
      setError('Please enter a group name');
      return;
    }
    
    if (selectedMembers.length === 0) {
      setError('Please select at least one member');
      return;
    }

    setLoading(true);
    try {
      console.log('Creating group...');
      
      const gasPrice = await getDynamicGasPrice(1.3);
      
      // Create group on blockchain
      const tx = await contract.methods
        .createGroup(newGroupName.trim(), newGroupDescription.trim(), selectedMembers)
        .send({ from: walletAddress, gasPrice });

      console.log('Group created:', tx);
      
      // Reload groups
      await loadGroupsAndFriends();
      
      // Reset form
      setNewGroupName('');
      setNewGroupDescription('');
      setSelectedMembers([]);
      setOpenCreateDialog(false);
      
    } catch (err) {
      console.error('Create group error:', err);
      setError(`Failed to create group: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMemberToggle = (address) => {
    setSelectedMembers(prev => {
      if (prev.includes(address)) {
        return prev.filter(addr => addr !== address);
      } else {
        return [...prev, address];
      }
    });
  };

  const handleOpenGroupChat = (group) => {
    navigate(`/group-chat/${group.id}`, { state: { group } });
  };

  const getGroupEmoji = (name) => {
    const emojis = ['👥', '🎉', '💼', '🎮', '📚', '🎵', '⚽', '🍕', '🌟', '🚀'];
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
      margin: '0 auto'
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '30px'
    },
    title: {
      color: '#ffffff',
      fontSize: '32px',
      fontWeight: '700',
      display: 'flex',
      alignItems: 'center',
      gap: '15px'
    },
    createBtn: {
      background: 'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)',
      color: 'white',
      border: 'none',
      padding: '12px 30px',
      borderRadius: '10px',
      cursor: 'pointer',
      fontSize: '16px',
      fontWeight: '600',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      boxShadow: '0 4px 15px rgba(138, 102, 255, 0.4)',
      transition: 'all 0.3s ease'
    },
    groupsList: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
      gap: '20px',
      marginTop: '20px'
    },
    groupCard: {
      background: 'linear-gradient(135deg, #1a1f3a 0%, #2d1b4e 100%)',
      border: '1px solid rgba(138, 102, 255, 0.2)',
      borderRadius: '15px',
      padding: '20px',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
    },
    groupEmoji: {
      fontSize: '48px',
      marginBottom: '10px'
    },
    groupName: {
      color: '#ffffff',
      fontSize: '20px',
      fontWeight: '600',
      marginBottom: '8px'
    },
    groupDescription: {
      color: '#b8b8d1',
      fontSize: '14px',
      marginBottom: '15px',
      minHeight: '40px'
    },
    groupInfo: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: '15px',
      borderTop: '1px solid rgba(138, 102, 255, 0.1)'
    },
    memberCount: {
      color: '#8a66ff',
      fontSize: '14px',
      display: 'flex',
      alignItems: 'center',
      gap: '5px'
    },
    dialogPaper: {
      background: 'linear-gradient(135deg, #1a1f3a 0%, #2d1b4e 100%)',
      border: '1px solid rgba(138, 102, 255, 0.3)',
      borderRadius: '15px',
      color: '#ffffff'
    },
    friendItem: {
      background: 'rgba(138, 102, 255, 0.05)',
      borderRadius: '10px',
      marginBottom: '8px',
      '&:hover': {
        background: 'rgba(138, 102, 255, 0.1)'
      }
    },
    emptyState: {
      textAlign: 'center',
      padding: '60px 20px',
      color: '#b8b8d1'
    }
  };

  return (
    <Box style={styles.container}>
      <Navbar username={username} walletAddress={walletAddress} onLogout={onLogout} />
      
      <Box style={styles.content}>
        <Box style={styles.header}>
          <Typography style={styles.title}>
            <PeopleIcon style={{ fontSize: '40px', color: '#8a66ff' }} />
            My Groups
          </Typography>
          <Button
            style={styles.createBtn}
            onClick={() => setOpenCreateDialog(true)}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            <GroupAddIcon />
            Create Group
          </Button>
        </Box>

        {error && (
          <Alert severity="error" style={{ marginBottom: '20px' }}>
            {error}
          </Alert>
        )}

        {loading && !groups.length ? (
          <Box style={styles.emptyState}>
            <CircularProgress style={{ color: '#8a66ff' }} />
            <Typography style={{ marginTop: '20px' }}>Loading groups...</Typography>
          </Box>
        ) : groups.length === 0 ? (
          <Box style={styles.emptyState}>
            <Typography variant="h5" style={{ marginBottom: '10px' }}>No groups yet</Typography>
            <Typography>Create your first serverless group!</Typography>
            <Typography style={{ marginTop: '20px', fontSize: '64px' }}>👥</Typography>
          </Box>
        ) : (
          <Box style={styles.groupsList}>
            {groups.map((group) => (
              <Paper 
                key={group.id} 
                style={styles.groupCard}
                onClick={() => handleOpenGroupChat(group)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-5px)';
                  e.currentTarget.style.boxShadow = '0 8px 30px rgba(138, 102, 255, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
                }}
              >
                <Box style={styles.groupEmoji}>{getGroupEmoji(group.name)}</Box>
                <Typography style={styles.groupName}>{group.name}</Typography>
                <Typography style={styles.groupDescription}>
                  {group.description || 'No description'}
                </Typography>
                <Box style={styles.groupInfo}>
                  <Typography style={styles.memberCount}>
                    <PeopleIcon style={{ fontSize: '18px' }} />
                    {group.members?.length || 0} members
                  </Typography>
                  <ChatIcon style={{ color: '#8a66ff', fontSize: '20px' }} />
                </Box>
              </Paper>
            ))}
          </Box>
        )}

        {/* Create Group Dialog */}
        <Dialog 
          open={openCreateDialog} 
          onClose={() => setOpenCreateDialog(false)}
          PaperProps={{ style: styles.dialogPaper }}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            <Box display="flex" alignItems="center" gap="10px">
              <GroupAddIcon style={{ color: '#8a66ff' }} />
              Create New Group
            </Box>
          </DialogTitle>
          <DialogContent>
            <TextField
              fullWidth
              label="Group Name"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              margin="normal"
              variant="outlined"
              InputLabelProps={{ style: { color: '#b8b8d1' } }}
              InputProps={{ style: { color: '#ffffff' } }}
            />
            <TextField
              fullWidth
              label="Description (Optional)"
              value={newGroupDescription}
              onChange={(e) => setNewGroupDescription(e.target.value)}
              margin="normal"
              variant="outlined"
              multiline
              rows={2}
              InputLabelProps={{ style: { color: '#b8b8d1' } }}
              InputProps={{ style: { color: '#ffffff' } }}
            />
            
            <Typography style={{ color: '#ffffff', marginTop: '20px', marginBottom: '10px', fontWeight: '600' }}>
              Select Members from Friends:
            </Typography>
            
            {friends.length === 0 ? (
              <Typography style={{ color: '#b8b8d1', padding: '20px', textAlign: 'center' }}>
                No friends available. Add friends first!
              </Typography>
            ) : (
              <List style={{ maxHeight: '300px', overflow: 'auto' }}>
                {friends.map((friend) => (
                  <ListItem 
                    key={friend.address} 
                    style={styles.friendItem}
                    button
                    onClick={() => handleMemberToggle(friend.address)}
                  >
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={selectedMembers.includes(friend.address)}
                          style={{ color: '#8a66ff' }}
                        />
                      }
                      label={
                        <Box display="flex" alignItems="center" gap="10px">
                          <Avatar style={{ background: 'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)' }}>
                            {friend.name.substring(0, 2).toUpperCase()}
                          </Avatar>
                          <Box>
                            <Typography style={{ color: '#ffffff' }}>{friend.name}</Typography>
                            <Typography style={{ color: '#b8b8d1', fontSize: '12px' }}>
                              {friend.address.substring(0, 10)}...
                            </Typography>
                          </Box>
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            )}
            
            {selectedMembers.length > 0 && (
              <Box mt={2}>
                <Typography style={{ color: '#8a66ff', fontSize: '14px' }}>
                  Selected: {selectedMembers.length} member(s)
                </Typography>
              </Box>
            )}
          </DialogContent>
          <DialogActions style={{ padding: '20px' }}>
            <Button 
              onClick={() => setOpenCreateDialog(false)}
              style={{ color: '#b8b8d1' }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateGroup}
              disabled={loading || !newGroupName.trim() || selectedMembers.length === 0}
              style={{
                background: 'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)',
                color: 'white',
                padding: '8px 24px',
                borderRadius: '8px'
              }}
            >
              {loading ? <CircularProgress size={24} style={{ color: 'white' }} /> : 'Create'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
};

export default Groups;
