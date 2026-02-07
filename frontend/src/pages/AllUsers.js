import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ChatPanel from '../components/ChatPanel';

const AllUsers = ({ walletAddress, onLogout }) => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const username = localStorage.getItem('username') || 'Anonymous';

  useEffect(() => {
    loadUsers();
    loadFriends();
  }, [walletAddress]);

  const loadUsers = () => {
    // Load all registered users from localStorage
    const allUsers = JSON.parse(localStorage.getItem('allChatUsers') || '[]');
    console.log('📋 All registered users:', allUsers);
    console.log('👤 Current wallet:', walletAddress);
    
    // Filter out current user
    const otherUsers = allUsers.filter(u => u.address.toLowerCase() !== walletAddress?.toLowerCase());
    console.log('👥 Users to display:', otherUsers);
    setUsers(otherUsers);
  };

  const loadFriends = () => {
    const friendsList = JSON.parse(localStorage.getItem(`friends_${walletAddress}`) || '[]');
    setFriends(friendsList);
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
    loadUsers();
  };

  const isFriend = (userAddress) => {
    return friends.some(f => f.toLowerCase() === userAddress.toLowerCase());
  };

  const addFriend = async (user) => {
    setLoading(true);
    try {
      // Simulate blockchain transaction
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Add to friends list
      const updatedFriends = [...friends, user.address];
      setFriends(updatedFriends);
      localStorage.setItem(`friends_${walletAddress}`, JSON.stringify(updatedFriends));
      
      alert(`✅ ${user.username} added as friend!`);
    } catch (error) {
      console.error('Error adding friend:', error);
      alert('Failed to add friend. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const startChat = (user) => {
    setSelectedUser(user);
  };

  const closeChat = () => {
    setSelectedUser(null);
  };

  const getAvatarEmoji = (username) => {
    const emojis = ['👨', '👩', '🧑', '👦', '👧', '🧔', '👴', '👵', '👨‍💼', '👩‍💼', '🧑‍💻', '👨‍🎓', '👩‍🎓', '🧑‍🎨', '👨‍🔬', '👩‍🔬'];
    const index = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % emojis.length;
    return emojis[index];
  };

  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #2d1b4e 100%)',
    },
    content: {
      padding: '40px',
      maxWidth: '1800px',
      margin: '0 auto',
      display: 'flex',
      gap: '30px',
      alignItems: 'stretch'
    },
    usersSection: {
      flex: selectedUser ? '0 0 35%' : '1',
      transition: 'all 0.3s ease',
    },
    chatSection: {
      flex: '0 0 62%',
      minHeight: '700px',
      animation: 'slideIn 0.3s ease-out',
    },
    header: {
      marginBottom: '40px'
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
    usersGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
      gap: '30px',
      animation: 'fadeIn 0.6s ease-out'
    },
    userCard: {
      background: 'linear-gradient(135deg, #1a1f3a 0%, #2d1b4e 100%)',
      borderRadius: '20px',
      padding: '30px',
      border: '1px solid rgba(138, 102, 255, 0.2)',
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
      transition: 'all 0.3s ease',
      textAlign: 'center',
      position: 'relative',
      overflow: 'hidden'
    },
    avatarContainer: {
      width: '100px',
      height: '100px',
      margin: '0 auto 20px',
      position: 'relative'
    },
    avatar: {
      width: '100px',
      height: '100px',
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #ff8c42 0%, #ff6b35 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '48px',
      boxShadow: '0 10px 30px rgba(255, 140, 66, 0.4)',
      animation: 'float 3s ease-in-out infinite',
      border: '4px solid rgba(255, 140, 66, 0.3)'
    },
    onlineIndicator: {
      position: 'absolute',
      top: '5px',
      right: '5px',
      width: '20px',
      height: '20px',
      background: '#4ade80',
      borderRadius: '50%',
      border: '3px solid #1a1f3a',
      boxShadow: '0 0 15px rgba(74, 222, 128, 0.6)',
      animation: 'pulse 2s ease-in-out infinite'
    },
    userName: {
      fontSize: '22px',
      fontWeight: '700',
      color: '#ffffff',
      marginBottom: '8px'
    },
    userAddress: {
      fontSize: '13px',
      color: '#8a66ff',
      fontFamily: 'monospace',
      marginBottom: '20px',
      wordBreak: 'break-all'
    },
    addFriendBtn: {
      width: '100%',
      padding: '12px',
      background: 'linear-gradient(135deg, #ff8c42 0%, #ff6b35 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '10px',
      fontSize: '15px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      boxShadow: '0 4px 15px rgba(255, 140, 66, 0.4)',
      marginBottom: '10px'
    },
    chatBtn: {
      width: '100%',
      padding: '12px',
      background: 'transparent',
      color: '#8a66ff',
      border: '2px solid #8a66ff',
      borderRadius: '10px',
      fontSize: '15px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.3s ease'
    },
    friendBadge: {
      display: 'inline-block',
      padding: '6px 16px',
      background: 'linear-gradient(135deg, #4ade80 0%, #22c55e 100%)',
      color: 'white',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: '600',
      marginBottom: '15px',
      boxShadow: '0 2px 10px rgba(74, 222, 128, 0.3)'
    },
    emptyState: {
      textAlign: 'center',
      padding: '60px 20px',
      color: '#b8b8d1'
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
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      <div style={styles.container}>
      <Navbar 
        username={username} 
        walletAddress={walletAddress} 
        onLogout={onLogout} 
      />
      
      <div style={styles.content}>
        <div style={styles.usersSection}>
          <div style={styles.header}>
          <h1 style={styles.title}>Find Your Friends</h1>
          <p style={styles.subtitle}>Connect with users and start chatting securely</p>
          <button
            onClick={() => {
              loadUsers();
              loadFriends();
            }}
            style={{
              marginTop: '15px',
              marginRight: '10px',
              padding: '10px 20px',
              background: 'rgba(255, 140, 66, 0.2)',
              border: '1px solid rgba(255, 140, 66, 0.4)',
              borderRadius: '8px',
              color: '#ff8c42',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = 'rgba(255, 140, 66, 0.3)';
              e.target.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'rgba(255, 140, 66, 0.2)';
              e.target.style.transform = 'scale(1)';
            }}
          >
            🔄 Refresh Users
          </button>
          <button
            onClick={addTestUsers}
            style={{
              marginTop: '15px',
              padding: '10px 20px',
              background: 'rgba(138, 102, 255, 0.2)',
              border: '1px solid rgba(138, 102, 255, 0.4)',
              borderRadius: '8px',
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
            🧪 Add Test Users (Dev Only)
          </button>
        </div>

        {users.length > 0 ? (
          <div style={styles.usersGrid}>
            {users.map((user, index) => (
              <div 
                key={index}
                style={styles.userCard}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-10px)';
                  e.currentTarget.style.boxShadow = '0 20px 40px rgba(138, 102, 255, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.3)';
                }}
              >
                <div style={styles.avatarContainer}>
                  <div style={styles.avatar}>
                    {getAvatarEmoji(user.username)}
                  </div>
                  <div style={styles.onlineIndicator}></div>
                </div>
                
                <h3 style={styles.userName}>{user.username}</h3>
                <p style={styles.userAddress}>
                  {user.address.substring(0, 6)}...{user.address.slice(-4)}
                </p>
                
                {isFriend(user.address) ? (
                  <>
                    <span style={styles.friendBadge}>✓ Friend</span>
                    <button
                      onClick={() => startChat(user)}
                      style={styles.chatBtn}
                      onMouseEnter={(e) => {
                        e.target.style.background = 'rgba(138, 102, 255, 0.2)';
                        e.target.style.transform = 'scale(1.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = 'transparent';
                        e.target.style.transform = 'scale(1)';
                      }}
                    >
                      💬 Start Chat
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => addFriend(user)}
                    disabled={loading}
                    style={{
                      ...styles.addFriendBtn,
                      opacity: loading ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!loading) {
                        e.target.style.transform = 'scale(1.05)';
                        e.target.style.boxShadow = '0 6px 25px rgba(255, 140, 66, 0.6)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!loading) {
                        e.target.style.transform = 'scale(1)';
                        e.target.style.boxShadow = '0 4px 15px rgba(255, 140, 66, 0.4)';
                      }
                    }}
                  >
                    {loading ? '⏳ Adding...' : '➕ Add Friend'}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={styles.emptyState}>
            <div style={{ fontSize: '64px', marginBottom: '20px' }}>👥</div>
            <h3 style={{ fontSize: '24px', marginBottom: '10px', color: '#fff' }}>No users found</h3>
            <p style={{ color: '#b8b8d1' }}>
              {JSON.parse(localStorage.getItem('allChatUsers') || '[]').length === 0 
                ? 'Be the first to invite your friends!' 
                : 'All registered users are already your friends or you\'re viewing yourself'}
            </p>
            <div style={{ 
              marginTop: '20px', 
              padding: '15px', 
              background: 'rgba(255, 140, 66, 0.1)', 
              borderRadius: '10px',
              border: '1px solid rgba(255, 140, 66, 0.3)',
              textAlign: 'left'
            }}>
              <p style={{ fontSize: '12px', color: '#ff8c42', marginBottom: '10px' }}>
                <strong>Debug Info:</strong>
              </p>
              <p style={{ fontSize: '11px', color: '#b8b8d1', fontFamily: 'monospace' }}>
                Total users in system: {JSON.parse(localStorage.getItem('allChatUsers') || '[]').length}<br/>
                Your wallet: {walletAddress?.substring(0, 10)}...<br/>
                Registered users: {JSON.parse(localStorage.getItem('allChatUsers') || '[]').map(u => u.username).join(', ') || 'None'}
              </p>
            </div>
          </div>
        )}
        </div>

        {/* Chat Section */}
        {selectedUser && (
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
    </>
  );
};

export default AllUsers;
