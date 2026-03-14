// frontend/src/pages/Groups.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { initWeb3, getWeb3 } from '../utils/blockchain';
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  FormControlLabel,
  Chip,
  CircularProgress,
  Alert,
  IconButton
} from '@mui/material';
import {
  GroupAdd as GroupAddIcon,
  Chat as ChatIcon,
  People as PeopleIcon,
  Search as SearchIcon,
  ContentCopy as CopyIcon,
  Sort as SortIcon
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';

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

  // UI state
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('recent'); // 'recent' | 'alpha'
  const [copiedGroupId, setCopiedGroupId] = useState(null);

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

      // Start with blockchain groups
      let mergedGroups = [...groupsData];

      // Also load from localStorage (for offline/imported groups)
      let localGroups = JSON.parse(
        localStorage.getItem(`groups_${walletAddress.toLowerCase()}`) || '[]'
      );
      if (localGroups.length === 0) {
        localGroups = JSON.parse(localStorage.getItem(`groups_${walletAddress}`) || '[]');
      }

      if (localGroups.length > 0) {
        localGroups.forEach((localGroup) => {
          if (!mergedGroups.find((g) => g.id === localGroup.id)) {
            mergedGroups.push(localGroup);
          }
        });
      }

      setGroups(mergedGroups);
      console.log(`✅ Loaded ${mergedGroups.length} groups`);
    } catch (error) {
      console.error('Error loading groups:', error);
      setError('Failed to load groups');

      // Fallback to localStorage
      let localGroups = JSON.parse(
        localStorage.getItem(`groups_${walletAddress.toLowerCase()}`) || '[]'
      );
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
          const friendData = await contract.methods
            .getFriend(walletAddress, friendAddress)
            .call();
          return {
            address: friendData.friendAddress.toLowerCase(),
            name: friendData.name,
            exists: friendData.exists
          };
        })
      );

      const activeFriends = friendsData.filter((f) => f.exists);

      // Load from localStorage (imported friends)
      const normalizedAddress = walletAddress.toLowerCase();
      let localFriends = JSON.parse(
        localStorage.getItem(`friends_${normalizedAddress}`) || '[]'
      );
      if (localFriends.length === 0) {
        localFriends = JSON.parse(localStorage.getItem(`friends_${walletAddress}`) || '[]');
      }

      // Merge friends
      const mergedFriendsMap = new Map();
      activeFriends.forEach((f) => mergedFriendsMap.set(f.address, f));
      localFriends.forEach((f) => mergedFriendsMap.set(f.address.toLowerCase(), f));

      setFriends(Array.from(mergedFriendsMap.values()));
    } catch (error) {
      console.error('Error loading friends:', error);
      const normalizedAddress = walletAddress.toLowerCase();
      let localFriends = JSON.parse(
        localStorage.getItem(`friends_${normalizedAddress}`) || '[]'
      );
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

      // Create group on blockchain
      const tx = await contract.methods
        .createGroup(newGroupName.trim(), newGroupDescription.trim(), selectedMembers)
        .send({ from: walletAddress });

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
    setSelectedMembers((prev) => {
      if (prev.includes(address)) {
        return prev.filter((addr) => addr !== address);
      } else {
        return [...prev, address];
      }
    });
  };

  const handleOpenGroupChat = (group) => {
    navigate(`/group-chat/${group.id}`, { state: { group } });
  };

  const handleCopyGroupId = (groupId, event) => {
    event.stopPropagation();
    if (navigator.clipboard && groupId != null) {
      navigator.clipboard.writeText(String(groupId)).then(() => {
        setCopiedGroupId(String(groupId));
        setTimeout(() => setCopiedGroupId(null), 1500);
      });
    }
  };

  const getGroupEmoji = (name) => {
    const emojis = ['👥', '🎉', '💼', '🎮', '📚', '🎵', '⚽', '🍕', '🌟', '🚀'];
    const index =
      name
        .split('')
        .reduce((acc, char) => acc + char.charCodeAt(0), 0) % emojis.length;
    return emojis[index];
  };

  // Derived data for UI
  const filteredAndSortedGroups = (() => {
    const term = searchTerm.trim().toLowerCase();

    let list = groups.map((g) => {
      const memberCount = g.members?.length || 0;
      const createdAtDate = g.createdAt ? new Date(g.createdAt) : null;

      // How many of your friends are in this group
      const friendMembers = (g.members || []).filter((addr) =>
        friends.some(
          (f) => f.address?.toLowerCase() === String(addr).toLowerCase()
        )
      );

      return {
        ...g,
        memberCount,
        createdAtDate,
        friendMembersCount: friendMembers.length
      };
    });

    if (term) {
      list = list.filter((g) => {
        const name = (g.name || '').toLowerCase();
        const desc = (g.description || '').toLowerCase();
        return name.includes(term) || desc.includes(term);
      });
    }

    list.sort((a, b) => {
      if (sortBy === 'alpha') {
        return (a.name || '').localeCompare(b.name || '');
      }
      // recent: newest first
      const ta = a.createdAtDate ? a.createdAtDate.getTime() : 0;
      const tb = b.createdAtDate ? b.createdAtDate.getTime() : 0;
      return tb - ta;
    });

    return list;
  })();

  const totalGroups = groups.length;
  const totalMembers = groups.reduce(
    (acc, g) => acc + (g.members?.length || 0),
    0
  );
  const groupsWithFriends = groups.filter((g) =>
    (g.members || []).some((addr) =>
      friends.some(
        (f) => f.address?.toLowerCase() === String(addr).toLowerCase()
      )
    )
  ).length;

  const styles = {
    container: {
      minHeight: '100vh',
      background: '#000000'
    },
    content: {
      padding: '96px 24px 40px',
      maxWidth: '1200px',
      margin: '0 auto'
    },
    header: {
      marginBottom: '32px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '16px'
    },
    title: {
      fontFamily: "Space Mono', monospace",
      fontSize: '32px',
      fontWeight: 600,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      color: '#ffffff',
      marginBottom: '8px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    },
    subtitle: {
      fontSize: '14px',
      color: 'rgba(255,255,255,0.4)',
       fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    },
    createBtn: {
      background: '#ffffff',
      color: '#000000',
      padding: '12px 30px',
      borderRadius: '999px',
      fontWeight: 600,
      fontSize: '14px',
      textTransform: 'none',
      boxShadow: '0 30px 80px rgba(0,0,0,0.9)'
    },
    statsRow: {
      display: 'flex',
      gap: 16,
      marginBottom: 24,
      flexWrap: 'wrap'
    },
    statCard: {
      flex: 1,
      minWidth: 220,
      padding: 16,
      borderRadius: 16,
      background: 'rgba(0,0,0,0.55)',
      border: '1px solid rgba(255,40,0,0.15)',
      boxShadow: '0 30px 80px rgba(0,0,0,0.9)',
      backdropFilter: 'blur(20px)'
    },
    filtersRow: {
      display: 'flex',
      gap: 16,
      marginBottom: 16,
      alignItems: 'center',
      flexWrap: 'wrap'
    },
    searchField: {
      flex: 1,
      minWidth: 220
    },
    sortButton: {
      borderColor: 'rgba(255,60,0,0.5)',
      color: '#ff8c42',
      borderRadius: '12px',
      textTransform: 'none',
      fontWeight: 600
    },
    groupsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: '20px',
      marginTop: '8px'
    },
    groupCard: {
      background: 'rgba(0,0,0,0.6)',
      borderRadius: 18,
      border: '1px solid rgba(255,40,0,0.18)',
      padding: 18,
      cursor: 'pointer',
      boxShadow: '0 30px 80px rgba(0,0,0,0.9)',
      transition: 'all 0.25s ease'
    },
    groupHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 8
    },
    groupEmojiWrap: {
      width: 46,
      height: 46,
      borderRadius: 999,
      background:
        'linear-gradient(135deg, rgba(255,140,66,0.28) 0%, rgba(255,60,0,0.18) 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 26,
      boxShadow: '0 6px 18px rgba(0,0,0,0.8)'
    },
    groupName: {
      color: '#ffffff',
      fontSize: '18px',
      fontWeight: 600
    },
    groupDescription: {
      color: '#b8b8d1',
      fontSize: '13px',
      marginTop: 4,
      minHeight: '38px'
    },
    groupMetaRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 12
    },
    metaChips: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6
    },
    emptyState: {
      textAlign: 'center',
      padding: '60px 20px',
      color: 'rgba(255,255,255,0.6)'
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
      marginBottom: '8px'
    }
  };

  return (
    <Box style={styles.container}>
      <Navbar
        username={username}
        walletAddress={walletAddress}
        onLogout={onLogout}
      />

      <Box style={styles.content}>
        {/* HEADER */}
        <Box style={styles.header}>
          <Box>
            <Typography style={styles.title}>
              <PeopleIcon sx={{ color: '#ff8c42' }} />
              GROUPS
              {contract && (
                <Chip
                  label="ON-CHAIN"
                  size="small"
                  sx={{
                    ml: 1.5,
                    fontFamily: "'Space Mono', monospace",
                    letterSpacing: '0.16em',
                    backgroundColor: 'rgba(0,0,0,0.85)',
                    color: '#ff3300',
                    borderRadius: '999px',
                    border: '1px solid rgba(255,60,0,0.7)',
                    fontWeight: 600,
                    height: 24
                  }}
                />
              )}
            </Typography>
            <Typography style={styles.subtitle}>
              Curate decentralized rooms with your friends. Messages live on-chain + IPFS.
            </Typography>
          </Box>

          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <GroupAddIcon />}
            onClick={() => setOpenCreateDialog(true)}
            sx={styles.createBtn}
            disabled={loading || !contract}
          >
            Create Group
          </Button>
        </Box>

        {error && (
          <Alert
            severity="error"
            sx={{
              mb: 2,
              backgroundColor: 'rgba(239,68,68,0.16)',
              color: '#ef4444',
              '& .MuiAlert-icon': { color: '#ef4444' }
            }}
          >
            {error}
          </Alert>
        )}

        


        {/* FILTERS */}
        {totalGroups > 0 && (
          <Box style={styles.filtersRow}>
            <Box
              sx={{
                position: 'relative',
                flex: 1,
                minWidth: 220
              }}
            >
              <SearchIcon
                sx={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#ff3300',
                  fontSize: 20
                }}
              />
              <TextField
                fullWidth
                size="small"
                placeholder="Search groups by name or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                sx={{
                  ...styles.searchField,
                  '& .MuiOutlinedInput-root': {
                    pl: '36px',
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    borderRadius: '12px',
                    '& fieldset': {
                      borderColor: 'rgba(255,40,0,0.25)'
                    },
                    '&:hover fieldset': {
                      borderColor: 'rgba(255,60,0,0.5)'
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: 'rgba(255,60,0,0.8)'
                    }
                  },
                  '& .MuiInputBase-input': {
                    color: '#ffffff',
                    fontSize: 14
                  }
                }}
              />
            </Box>

            <Button
              variant="outlined"
              startIcon={<SortIcon />}
              onClick={() =>
                setSortBy((prev) => (prev === 'recent' ? 'alpha' : 'recent'))
              }
              sx={styles.sortButton}
            >
              Sort: {sortBy === 'recent' ? 'Newest' : 'A–Z'}
            </Button>
          </Box>
        )}

        {/* GROUPS LIST / EMPTY STATES */}
        {loading && !groups.length ? (
          <Box style={styles.emptyState}>
            <CircularProgress style={{ color: '#ff8c42' }} />
            <Typography sx={{ mt: 2 }}>Loading groups...</Typography>
          </Box>
        ) : groups.length === 0 ? (
          <Box style={styles.emptyState}>
            <Typography
              variant="h5"
              sx={{ mb: 1, fontFamily: "'Space Mono', monospace", letterSpacing: '0.16em' }}
            >
              NO GROUPS YET
            </Typography>
            <Typography sx={{ mb: 2 }}>
              Create your first decentralized room with your on‑chain friends.
            </Typography>
            <Typography sx={{ fontSize: 72, mb: 3 }}>👥</Typography>
            <Button
              variant="contained"
              startIcon={<GroupAddIcon />}
              sx={styles.createBtn}
              onClick={() => setOpenCreateDialog(true)}
              disabled={loading || !contract}
            >
              Create your first group
            </Button>
          </Box>
        ) : filteredAndSortedGroups.length === 0 ? (
          <Box style={styles.emptyState}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              No groups match your search
            </Typography>
            <Typography variant="body2">
              Try adjusting your search term or sort order.
            </Typography>
          </Box>
        ) : (
          <Box style={styles.groupsGrid}>
            {filteredAndSortedGroups.map((group) => (
              <Paper
                key={group.id}
                style={styles.groupCard}
                onClick={() => handleOpenGroupChat(group)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.borderColor = 'rgba(255,60,0,0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = 'rgba(255,40,0,0.18)';
                }}
              >
                <Box style={styles.groupHeader}>
                  <Box style={styles.groupEmojiWrap}>
                    <span>{getGroupEmoji(group.name || '')}</span>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography style={styles.groupName}>
                      {group.name || 'Unnamed Group'}
                    </Typography>
                    {group.createdAtDate && (
                      <Typography
                        sx={{
                          fontSize: 11,
                          color: 'rgba(255,255,255,0.5)',
                          fontFamily: "'Space Mono', monospace"
                        }}
                      >
                        Created{' '}
                        {formatDistanceToNow(group.createdAtDate, {
                          addSuffix: true
                        })}
                      </Typography>
                    )}
                  </Box>
                  <IconButton
                    size="small"
                    onClick={(e) => handleCopyGroupId(group.id, e)}
                    sx={{ color: '#b8b8d1' }}
                  >
                    <CopyIcon fontSize="small" />
                  </IconButton>
                </Box>

                <Typography style={styles.groupDescription}>
                  {group.description || 'No description set for this group.'}
                </Typography>

                <Box style={styles.groupMetaRow}>
                  <Box style={styles.metaChips}>
                    <Chip
                      icon={<PeopleIcon sx={{ fontSize: 16 }} />}
                      label={`${group.memberCount} member${
                        group.memberCount === 1 ? '' : 's'
                      }`}
                      size="small"
                      sx={{
                        backgroundColor: 'rgba(255,140,66,0.18)',
                        color: '#ff8c42',
                        fontSize: 11,
                        height: 22
                      }}
                    />
                    {group.friendMembersCount > 0 && (
                      <Chip
                        label={`${group.friendMembersCount} friend${
                          group.friendMembersCount === 1 ? '' : 's'
                        } here`}
                        size="small"
                        sx={{
                          backgroundColor: 'rgba(16,185,129,0.18)',
                          color: '#10b981',
                          fontSize: 11,
                          height: 22
                        }}
                      />
                    )}
                  </Box>
                  <IconButton
                    size="small"
                    sx={{
                      color: '#ffffff',
                      backgroundColor: 'rgba(255,140,66,0.18)',
                      '&:hover': {
                        backgroundColor: 'rgba(255,140,66,0.3)'
                      }
                    }}
                  >
                    <ChatIcon fontSize="small" />
                  </IconButton>
                </Box>

                {copiedGroupId && String(copiedGroupId) === String(group.id) && (
                  <Typography
                    sx={{
                      mt: 1,
                      fontSize: 11,
                      color: '#4ade80',
                      fontFamily: "'Space Mono', monospace",
                    }}
                  >
                    Group ID copied
                  </Typography>
                )}
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

            <Typography
              style={{
                color: '#ffffff',
                marginTop: '20px',
                marginBottom: '10px',
                fontWeight: '600'
              }}
            >
              Select Members from Friends:
            </Typography>

            {friends.length === 0 ? (
              <Typography
                style={{
                  color: '#b8b8d1',
                  padding: '20px',
                  textAlign: 'center'
                }}
              >
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
                          <Avatar
                            style={{
                              background:
                                'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)'
                            }}
                          >
                            {friend.name
                              ? friend.name.substring(0, 2).toUpperCase()
                              : 'FR'}
                          </Avatar>
                          <Box>
                            <Typography style={{ color: '#ffffff' }}>
                              {friend.name || 'Friend'}
                            </Typography>
                            <Typography
                              style={{
                                color: '#b8b8d1',
                                fontSize: '12px'
                              }}
                            >
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
                background:
                  'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)',
                color: 'white',
                padding: '8px 24px',
                borderRadius: '8px'
              }}
            >
              {loading ? (
                <CircularProgress size={24} style={{ color: 'white' }} />
              ) : (
                'Create'
              )}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
};

export default Groups;