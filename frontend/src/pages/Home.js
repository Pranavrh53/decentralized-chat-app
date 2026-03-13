import React, { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import ChatPanel from "../components/ChatPanel";

const Home = ({ walletAddress, onLogout }) => {
  const [friends, setFriends] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [newFriendAddress, setNewFriendAddress] = useState("");
  const [newFriendName, setNewFriendName] = useState("");
  const [quickChatAddress, setQuickChatAddress] = useState("");
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [selectedUser, setSelectedUser] = useState(null);
  const username = localStorage.getItem("username") || "Anonymous";

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    loadFriends();
    loadAllUsers();
  }, [walletAddress]);

  const loadFriends = () => {
    let friendsList = JSON.parse(localStorage.getItem(`friends_${walletAddress}`) || '[]');
    if (friendsList.length === 0) {
      friendsList = JSON.parse(localStorage.getItem(`friends_${walletAddress.toLowerCase()}`) || '[]');
    }
    const allUsersData = JSON.parse(localStorage.getItem('allChatUsers') || '[]');
    const customNames = JSON.parse(localStorage.getItem(`friend_names_${walletAddress}`) || '{}');
    
    // Get friend details - handle both old format (strings) and new format (objects)
    const friendsData = friendsList.map(friendItem => {
      // Extract address from either string or object format
      const friendAddress = typeof friendItem === 'string' ? friendItem : friendItem.address;
      const friendName = typeof friendItem === 'object' && friendItem.name ? friendItem.name : null;
      
      if (!friendAddress) return null;
      
      const user = allUsersData.find(u => u.address && u.address.toLowerCase() === friendAddress.toLowerCase());
      const customName = friendName || customNames[friendAddress.toLowerCase()];
      
      if (user) {
        return { ...user, username: customName || user.username };
      }
      return { address: friendAddress, username: customName || 'Unknown User' };
    }).filter(Boolean);
    
    setFriends(friendsData);
  };

  const loadAllUsers = () => {
    const allUsersData = JSON.parse(localStorage.getItem('allChatUsers') || '[]');
    const friendsList = JSON.parse(localStorage.getItem(`friends_${walletAddress}`) || '[]');
    const customNames = JSON.parse(localStorage.getItem(`friend_names_${walletAddress}`) || '{}');
    
    // Include friends with custom names in the all users list
    const allUsersMap = new Map();
    
    // Add existing registered users
    allUsersData.forEach(user => {
      if (user.address) {
        allUsersMap.set(user.address.toLowerCase(), user);
      }
    });
    
    // Add friends who might not be in allChatUsers yet (manually added)
    // Handle both old format (strings) and new format (objects)
    friendsList.forEach(friendItem => {
      const friendAddr = typeof friendItem === 'string' ? friendItem : friendItem.address;
      const friendName = typeof friendItem === 'object' && friendItem.name ? friendItem.name : null;
      
      if (!friendAddr) return;
      
      const lowerAddr = friendAddr.toLowerCase();
      if (!allUsersMap.has(lowerAddr)) {
        const customName = friendName || customNames[lowerAddr];
        allUsersMap.set(lowerAddr, {
          address: friendAddr,
          username: customName || 'Unknown User',
          joinedAt: new Date().toISOString()
        });
      } else {
        // Update with custom name if exists
        const customName = friendName || customNames[lowerAddr];
        if (customName) {
          const user = allUsersMap.get(lowerAddr);
          allUsersMap.set(lowerAddr, { ...user, username: customName });
        }
      }
    });
    
    // Convert back to array and filter out current user and friends
    const friendAddresses = friendsList.map(item => 
      typeof item === 'string' ? item.toLowerCase() : item.address?.toLowerCase()
    ).filter(Boolean);
    
    const availableUsers = Array.from(allUsersMap.values()).filter(user => 
      user.address && user.address.toLowerCase() !== walletAddress?.toLowerCase() &&
      !friendAddresses.includes(user.address.toLowerCase())
    );
    
    setAllUsers(availableUsers);
  };

  const startChat = (friend) => {
    setSelectedUser(friend);
  };

  const closeChat = () => {
    setSelectedUser(null);
  };

  const removeFriend = (friend, e) => {
    e.stopPropagation(); // Prevent chat from opening
    
    if (window.confirm(`Remove ${friend.username} from your friends?`)) {
      const friendsList = JSON.parse(localStorage.getItem(`friends_${walletAddress}`) || '[]');
      
      // Handle both old format (strings) and new format (objects)
      const updatedList = friendsList.filter(item => {
        const addr = typeof item === 'string' ? item : item.address;
        return addr && addr.toLowerCase() !== friend.address.toLowerCase();
      });
      
      localStorage.setItem(`friends_${walletAddress}`, JSON.stringify(updatedList));
      
      alert(`✅ ${friend.username} removed from friends`);
      loadFriends();
      loadAllUsers();
    }
  };

  const addFriend = (user) => {
    const friendsList = JSON.parse(localStorage.getItem(`friends_${walletAddress}`) || '[]');
    
    // Check if friend already exists - handle both old and new formats
    const friendExists = friendsList.some(item => {
      const addr = typeof item === 'string' ? item : item.address;
      return addr && addr.toLowerCase() === user.address.toLowerCase();
    });
    
    if (!friendExists) {
      // Add to friends list in new object format
      friendsList.push({
        address: user.address,
        name: user.username || 'Friend',
        addedAt: new Date().toISOString()
      });
      localStorage.setItem(`friends_${walletAddress}`, JSON.stringify(friendsList));
      alert(`✅ ${user.username} added to your friends!`);
      loadFriends();
      loadAllUsers();
    }
  };

  const addFriendByAddress = () => {
    const address = newFriendAddress.trim();
    const name = newFriendName.trim();
    
    if (!address) {
      alert('⚠️ Please enter a wallet address');
      return;
    }
    
    if (address.length < 42 || !address.startsWith('0x')) {
      alert('⚠️ Please enter a valid Ethereum address (0x...)');
      return;
    }
    
    if (address.toLowerCase() === walletAddress?.toLowerCase()) {
      alert('⚠️ You cannot add yourself as a friend!');
      return;
    }
    
    const friendsList = JSON.parse(localStorage.getItem(`friends_${walletAddress}`) || '[]');
    
    // Check if friend already exists - handle both old and new formats
    const friendExists = friendsList.some(item => {
      const addr = typeof item === 'string' ? item : item.address;
      return addr && addr.toLowerCase() === address.toLowerCase();
    });
    
    if (friendExists) {
      alert('⚠️ This user is already your friend!');
      return;
    }
    
    // Add to friends list in new object format
    friendsList.push({
      address: address,
      name: name || 'Friend',
      addedAt: new Date().toISOString()
    });
    localStorage.setItem(`friends_${walletAddress}`, JSON.stringify(friendsList));
    
    // Save custom name if provided
    if (name) {
      const customNames = JSON.parse(localStorage.getItem(`friend_names_${walletAddress}`) || '{}');
      customNames[address.toLowerCase()] = name;
      localStorage.setItem(`friend_names_${walletAddress}`, JSON.stringify(customNames));
      
      // Also add to allChatUsers if not exis
      const allUsers = JSON.parse(localStorage.getItem('allChatUsers') || '[]');
      const userExists = allUsers.some(u => u.address.toLowerCase() === address.toLowerCase());
      if (!userExists) {
        allUsers.push({
          username: name,
          address: address,
          joinedAt: new Date().toISOString()
        });
        localStorage.setItem('allChatUsers', JSON.stringify(allUsers));
      }
    }
    
    setNewFriendAddress('');
    setNewFriendName('');
    alert(`✅ ${name || 'Friend'} added! You can now chat with them.`);
    loadFriends();
    loadAllUsers();
  };

  const startQuickChat = () => {
    const address = quickChatAddress.trim();
    
    if (!address) {
      alert('⚠️ Please enter a wallet address');
      return;
    }
    
    if (address.length < 42 || !address.startsWith('0x')) {
      alert('⚠️ Please enter a valid Ethereum address (0x...)');
      return;
    }
    
    if (address.toLowerCase() === walletAddress?.toLowerCase()) {
      alert('⚠️ You cannot chat with yourself!');
      return;
    }
    
    // Create a user object for the chat panel
    setSelectedUser({
      address: address,
      username: 'Quick Chat User'
    });
    setQuickChatAddress('');
  };

  const addTestUsers = () => {
    const testUsers = [
      {
        username: 'Alice',
        address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        joinedAt: new Date().toISOString()
      },
      {
        username: 'Bob',
        address: '0x5A0b54D5dc17e0AadC383d2db43B0a0D3E029c4c',
        joinedAt: new Date().toISOString()
      },
      {
        username: 'Charlie',
        address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        joinedAt: new Date().toISOString()
      },
      {
        username: 'Diana',
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        joinedAt: new Date().toISOString()
      }
    ];

    const existingUsers = JSON.parse(localStorage.getItem('allChatUsers') || '[]');
    const mergedUsers = [...existingUsers];
    
    testUsers.forEach(testUser => {
      const exists = mergedUsers.some(u => u.address.toLowerCase() === testUser.address.toLowerCase());
      if (!exists) {
        mergedUsers.push(testUser);
      }
    });
    
    localStorage.setItem('allChatUsers', JSON.stringify(mergedUsers));
    alert(`✅ Added ${mergedUsers.length - existingUsers.length} test users!`);
    loadAllUsers();
  };

  const clearChat = (friend) => {
    if (window.confirm(`Clear chat history with ${friend.username}?`)) {
      const chatKey = `chat_${walletAddress}_${friend.address}`;
      localStorage.removeItem(chatKey);
      alert('Chat cleared!');
    }
  };

  const getAvatarEmoji = (username) => {
    const emojis = ['👨', '👩', '🧑', '👦', '👧', '🧔', '👴', '👵', '👨‍💼', '👩‍💼', '🧑‍💻', '👨‍🎓', '👩‍🎓', '🧑‍🎨', '👨‍🔬', '👩‍🔬'];
    const index = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % emojis.length;
    return emojis[index];
  };

  const filteredFriends = friends.filter(friend => 
    friend.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    friend.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #2d1b4e 100%)',
    },
    mainContent: {
      display: 'flex',
      height: 'calc(100vh - 80px)',
      gap: '20px',
      padding: selectedUser ? '20px' : '0'
    },
    sidebar: {
      width: selectedUser ? '320px' : '400px',
      minWidth: selectedUser ? '320px' : '400px',
      transition: 'all 0.3s ease',
      background: 'linear-gradient(135deg, #1a1f3a 0%, #2d1b4e 100%)',
      borderRight: '1px solid rgba(138, 102, 255, 0.2)',
      display: 'flex',
      flexDirection: 'column'
    },
    searchContainer: {
      padding: '20px'
    },
    searchBox: {
      width: '100%',
      padding: '12px 16px 12px 40px',
      background: 'rgba(26, 31, 58, 0.6)',
      border: '2px solid rgba(138, 102, 255, 0.3)',
      borderRadius: '25px',
      color: '#fff',
      fontSize: '14px',
      outline: 'none',
      transition: 'all 0.3s ease',
      boxSizing: 'border-box'
    },
    searchIcon: {
      position: 'absolute',
      left: '35px',
      top: '33px',
      color: '#ff8c42',
      fontSize: '18px'
    },
    friendsList: {
      flex: 1,
      overflowY: 'auto',
      padding: '20px'
    },
    friendCard: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '15px',
      marginBottom: '10px',
      background: 'rgba(26, 31, 58, 0.4)',
      borderRadius: '12px',
      border: '1px solid rgba(138, 102, 255, 0.2)',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      gap: '15px'
    },
    avatar: {
      width: '50px',
      height: '50px',
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #ff8c42 0%, #ff6b35 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '24px',
      marginRight: '15px',
      animation: 'float 3s ease-in-out infinite',
      boxShadow: '0 4px 15px rgba(255, 140, 66, 0.4)',
      transition: 'transform 0.1s ease-out',
      cursor: 'pointer'
    },
    friendInfo: {
      flex: 1
    },
    friendName: {
      fontSize: '16px',
      fontWeight: '600',
      color: '#fff',
      marginBottom: '4px'
    },
    friendAddress: {
      fontSize: '12px',
      color: '#8a66ff',
      fontFamily: 'monospace'
    },
    chatArea: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: selectedUser ? '0' : '40px',
      overflowY: 'auto'
    },
    chatSection: {
      flex: 1,
      minHeight: '700px',
      animation: 'slideIn 0.3s ease-out',
    },
    emptyState: {
      textAlign: 'center'
    },
    emptyIcon: {
      fontSize: '80px',
      marginBottom: '20px',
      opacity: 0.5
    },
    emptyTitle: {
      fontSize: '28px',
      color: '#fff',
      marginBottom: '10px',
      fontWeight: '600'
    },
    emptyText: {
      fontSize: '16px',
      color: '#b8b8d1',
      marginBottom: '30px'
    },
    addFriendBtn: {
      padding: '14px 30px',
      background: 'linear-gradient(135deg, #ff8c42 0%, #ff6b35 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '10px',
      fontSize: '16px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      boxShadow: '0 4px 15px rgba(255, 140, 66, 0.4)'
    },
    usersGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
      gap: '20px',
      padding: '20px',
      maxWidth: '1200px',
      width: '100%'
    },
    userCard: {
      background: 'rgba(26, 31, 58, 0.6)',
      borderRadius: '16px',
      padding: '20px',
      border: '1px solid rgba(138, 102, 255, 0.2)',
      textAlign: 'center',
      transition: 'all 0.3s ease',
      cursor: 'pointer'
    },
    userAvatar: {
      width: '80px',
      height: '80px',
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #ff8c42 0%, #ff6b35 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '40px',
      margin: '0 auto 15px',
      animation: 'float 3s ease-in-out infinite',
      boxShadow: '0 4px 15px rgba(255, 140, 66, 0.4)',
      transition: 'transform 0.1s ease-out',
      cursor: 'pointer'
    },
    userName: {
      fontSize: '18px',
      fontWeight: '600',
      color: '#fff',
      marginBottom: '8px'
    },
    userAddress: {
      fontSize: '12px',
      color: '#8a66ff',
      fontFamily: 'monospace',
      marginBottom: '15px'
    },
    addBtn: {
      width: '100%',
      padding: '10px 20px',
      background: 'linear-gradient(135deg, #ff8c42 0%, #ff6b35 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      boxShadow: '0 4px 15px rgba(255, 140, 66, 0.4)'
    },
    sectionTitle: {
      fontSize: '32px',
      fontWeight: '700',
      color: '#fff',
      textAlign: 'center',
      marginBottom: '30px',
      textShadow: '0 0 20px rgba(138, 102, 255, 0.5)'
    },
    addFriendSection: {
      padding: '20px',
      borderTop: '1px solid rgba(138, 102, 255, 0.2)',
      borderBottom: '1px solid rgba(138, 102, 255, 0.2)',
      background: 'rgba(26, 31, 58, 0.3)'
    },
    addFriendTitle: {
      fontSize: '14px',
      fontWeight: '600',
      color: '#ff8c42',
      marginBottom: '12px',
      textTransform: 'uppercase',
      letterSpacing: '1px'
    },
    inputGroup: {
      display: 'flex',
      gap: '10px'
    },
    input: {
      flex: 1,
      padding: '10px 14px',
      background: 'rgba(26, 31, 58, 0.6)',
      border: '2px solid rgba(138, 102, 255, 0.3)',
      borderRadius: '8px',
      color: '#fff',
      fontSize: '13px',
      outline: 'none',
      transition: 'all 0.3s ease',
      boxSizing: 'border-box',
      fontFamily: 'monospace'
    },
    addButton: {
      padding: '10px 20px',
      background: 'linear-gradient(135deg, #ff8c42 0%, #ff6b35 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      boxShadow: '0 4px 15px rgba(255, 140, 66, 0.4)',
      whiteSpace: 'nowrap'
    },
    quickChatSection: {
      width: '100%',
      maxWidth: '600px',
      padding: '30px',
      background: 'rgba(26, 31, 58, 0.6)',
      borderRadius: '20px',
      border: '1px solid rgba(138, 102, 255, 0.2)',
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
      marginBottom: '40px'
    },
    quickChatTitle: {
      fontSize: '24px',
      fontWeight: '600',
      color: '#fff',
      marginBottom: '10px',
      textAlign: 'center'
    },
    quickChatSubtitle: {
      fontSize: '14px',
      color: '#b8b8d1',
      marginBottom: '25px',
      textAlign: 'center'
    },
    quickChatInputGroup: {
      display: 'flex',
      gap: '15px',
      alignItems: 'center'
    },
    quickChatInput: {
      flex: 1,
      padding: '14px 18px',
      background: 'rgba(26, 31, 58, 0.8)',
      border: '2px solid rgba(138, 102, 255, 0.3)',
      borderRadius: '12px',
      color: '#fff',
      fontSize: '14px',
      outline: 'none',
      transition: 'all 0.3s ease',
      boxSizing: 'border-box',
      fontFamily: 'monospace'
    },
    quickChatButton: {
      padding: '14px 30px',
      background: 'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '12px',
      fontSize: '16px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      boxShadow: '0 4px 15px rgba(138, 102, 255, 0.4)',
      whiteSpace: 'nowrap'
    },
    divider: {
      display: 'flex',
      alignItems: 'center',
      margin: '40px 0',
      width: '100%',
      maxWidth: '600px'
    },
    dividerLine: {
      flex: 1,
      height: '1px',
      background: 'linear-gradient(90deg, transparent, rgba(138, 102, 255, 0.5), transparent)'
    },
    dividerText: {
      padding: '0 20px',
      fontSize: '14px',
      color: '#8a66ff',
      fontWeight: '600'
    }
  };

  return (
    <>
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(30px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
      <div style={styles.container}>
      <Navbar 
        username={username} 
        walletAddress={walletAddress} 
        onLogout={onLogout} 
      />
      
      <div style={styles.mainContent}>
        {/* Sidebar with friends list */}
        <div style={styles.sidebar}>
          <div style={styles.searchContainer}>
            <div style={{ position: 'relative' }}>
              <span style={styles.searchIcon}>🔍</span>
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={styles.searchBox}
                onFocus={(e) => e.target.style.borderColor = '#ff8c42'}
                onBlur={(e) => e.target.style.borderColor = 'rgba(138, 102, 255, 0.3)'}
              />
            </div>
          </div>

          {/* Add Friend by Address */}
          <div style={styles.addFriendSection}>
            <div style={styles.addFriendTitle}>➕ Add Friend</div>
            <input
              type="text"
              placeholder="Friend's Name (optional)"
              value={newFriendName}
              onChange={(e) => setNewFriendName(e.target.value)}
              style={{ ...styles.input, marginBottom: '10px' }}
              onFocus={(e) => e.target.style.borderColor = '#ff8c42'}
              onBlur={(e) => e.target.style.borderColor = 'rgba(138, 102, 255, 0.3)'}
            />
            <div style={styles.inputGroup}>
              <input
                type="text"
                placeholder="0x... wallet address"
                value={newFriendAddress}
                onChange={(e) => setNewFriendAddress(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addFriendByAddress()}
                style={styles.input}
                onFocus={(e) => e.target.style.borderColor = '#ff8c42'}
                onBlur={(e) => e.target.style.borderColor = 'rgba(138, 102, 255, 0.3)'}
              />
              <button
                onClick={addFriendByAddress}
                style={styles.addButton}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'scale(1.05)';
                  e.target.style.boxShadow = '0 6px 20px rgba(255, 140, 66, 0.6)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'scale(1)';
                  e.target.style.boxShadow = '0 4px 15px rgba(255, 140, 66, 0.4)';
                }}
              >
                Add
              </button>
            </div>
          </div>

          <div style={styles.friendsList}>
            {filteredFriends.length > 0 ? (
              filteredFriends.map((friend, index) => (
                <div
                  key={index}
                  style={styles.friendCard}
                  onClick={() => startChat(friend)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(138, 102, 255, 0.2)';
                    e.currentTarget.style.transform = 'translateX(10px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(26, 31, 58, 0.4)';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <div 
                    style={styles.avatar}
                    onMouseMove={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left - rect.width / 2;
                      const y = e.clientY - rect.top - rect.height / 2;
                      e.currentTarget.style.transform = `translate(${x / 5}px, ${y / 5}px) scale(1.1)`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translate(0, 0) scale(1)';
                    }}
                  >
                    {getAvatarEmoji(friend.username)}
                  </div>
                  <div style={styles.friendInfo}>
                    <div style={styles.friendName}>{friend.username}</div>
                    <div style={styles.friendAddress}>
                      {friend.address.substring(0, 6)}...{friend.address.slice(-4)}
                    </div>
                  </div>
                  <button
                    onClick={(e) => removeFriend(friend, e)}
                    style={{
                      padding: '8px 12px',
                      background: 'rgba(239, 68, 68, 0.2)',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      borderRadius: '8px',
                      color: '#ef4444',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      whiteSpace: 'nowrap'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'rgba(239, 68, 68, 0.3)';
                      e.target.style.transform = 'scale(1.05)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'rgba(239, 68, 68, 0.2)';
                      e.target.style.transform = 'scale(1)';
                    }}
                  >
                    🗑️ Remove
                  </button>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#b8b8d1' }}>
                <div style={{ fontSize: '48px', marginBottom: '15px' }}>👥</div>
                <p>No friends yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Main chat area */}
        <div style={styles.chatArea}>
          {!selectedUser ? (
            <>
          {/* Quick Chat Section */}
          <div style={styles.quickChatSection}>
            <h3 style={styles.quickChatTitle}>💬 Quick Chat</h3>
            <p style={styles.quickChatSubtitle}>Enter a wallet address to start chatting instantly</p>
            <div style={styles.quickChatInputGroup}>
              <input
                type="text"
                placeholder="0x... wallet address"
                value={quickChatAddress}
                onChange={(e) => setQuickChatAddress(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && startQuickChat()}
                style={styles.quickChatInput}
                onFocus={(e) => {
                  e.target.style.borderColor = '#8a66ff';
                  e.target.style.boxShadow = '0 0 15px rgba(138, 102, 255, 0.3)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(138, 102, 255, 0.3)';
                  e.target.style.boxShadow = 'none';
                }}
              />
              <button
                onClick={startQuickChat}
                style={styles.quickChatButton}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'scale(1.05)';
                  e.target.style.boxShadow = '0 6px 25px rgba(138, 102, 255, 0.6)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'scale(1)';
                  e.target.style.boxShadow = '0 4px 15px rgba(138, 102, 255, 0.4)';
                }}
              >
                Start Chat 🚀
              </button>
            </div>
          </div>

          {/* Divider */}
          <div style={styles.divider}>
            <div style={styles.dividerLine}></div>
            <span style={styles.dividerText}>OR</span>
            <div style={styles.dividerLine}></div>
          </div>

          <div style={styles.emptyState}>
            <h2 style={styles.sectionTitle}>👥 Find Your Friends</h2>
            <div style={{ marginBottom: '30px', textAlign: 'center' }}>
              <button
                onClick={addTestUsers}
                style={{
                  padding: '12px 24px',
                  background: 'rgba(138, 102, 255, 0.2)',
                  border: '1px solid rgba(138, 102, 255, 0.4)',
                  borderRadius: '10px',
                  color: '#8a66ff',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'rgba(138, 102, 255, 0.3)';
                  e.target.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'rgba(138, 102, 255, 0.2)';
                  e.target.style.transform = 'scale(1)';
                }}
              >
                🧪 Add Test Users (For Testing)
              </button>
            </div>
            
            {allUsers.length > 0 ? (
              <div style={styles.usersGrid}>
                {allUsers.map((user, index) => (
                  <div
                    key={index}
                    style={styles.userCard}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(138, 102, 255, 0.2)';
                      e.currentTarget.style.transform = 'translateY(-5px)';
                      e.currentTarget.style.boxShadow = '0 8px 25px rgba(138, 102, 255, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(26, 31, 58, 0.6)';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div 
                      style={styles.userAvatar}
                      onMouseMove={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left - rect.width / 2;
                        const y = e.clientY - rect.top - rect.height / 2;
                        e.currentTarget.style.transform = `translate(${x / 4}px, ${y / 4}px) scale(1.15)`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translate(0, 0) scale(1)';
                      }}
                    >
                      {getAvatarEmoji(user.username)}
                    </div>
                    <div style={styles.userName}>{user.username}</div>
                    <div style={styles.userAddress}>
                      {user.address.substring(0, 6)}...{user.address.slice(-4)}
                    </div>
                    <button
                      style={styles.addBtn}
                      onClick={() => addFriend(user)}
                      onMouseEnter={(e) => {
                        e.target.style.transform = 'scale(1.05)';
                        e.target.style.boxShadow = '0 6px 25px rgba(255, 140, 66, 0.6)';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.transform = 'scale(1)';
                        e.target.style.boxShadow = '0 4px 15px rgba(255, 140, 66, 0.4)';
                      }}
                    >
                      ➕ Add Friend
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={styles.emptyIcon}>👥</div>
                <h2 style={styles.emptyTitle}>No Users Available</h2>
                <p style={styles.emptyText}>
                  All users are already your friends or no other users have registered yet
                </p>
              </div>
            )}
          </div>
            </>
          ) : (
            /* Chat Panel Section */
            <div style={styles.chatSection}>
              <ChatPanel 
                walletAddress={walletAddress}
                selectedUser={selectedUser}
                onClose={closeChat}
              />
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
};

export default Home;