import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import HumanAvatar from './HumanAvatar';

const Navbar = ({ username, walletAddress, onLogout }) => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const getInitials = (name) => {
    if (!name) return '?';
    return name.substring(0, 2).toUpperCase();
  };

  const styles = {
    navbar: {
      background: 'rgba(0,0,0,0.85)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      padding: '0 32px',
      height: '64px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottom: '1px solid rgba(255,40,0,0.12)',
      position: 'sticky',
      top: 0,
      zIndex: 1000,
      boxShadow: '0 18px 40px rgba(0, 0, 0, 0.85)'
    },
    logo: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    },
    logoIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 8,
      border: '1px solid rgba(255,60,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 0 18px rgba(255,60,0,0.45)',
      background: 'rgba(0,0,0,0.8)',
    },
    logoHex: {
      width: 20,
      height: 20,
      fill: '#ff3300',
      filter: 'drop-shadow(0 0 8px rgba(255,60,0,0.7))',
    },
    logoTextBox: {
      display: 'flex',
      flexDirection: 'column',
      lineHeight: 1.1,
    },
    logoTitle: {
      fontFamily: "'Space Mono', monospace",
      fontSize: 16,
      letterSpacing: '0.18em',
      color: '#ffffff',
    },
    logoSubtitle: {
      fontFamily: "'Space Mono', monospace",
      fontSize: 9,
      letterSpacing: '0.24em',
      textTransform: 'uppercase',
      color: 'rgba(255,60,0,0.85)',
    },
    navLinks: {
      display: 'flex',
      gap: '26px',
      alignItems: 'center'
    },
    navLink: {
      color: 'rgba(255,255,255,0.45)',
      textDecoration: 'none',
      fontSize: '13px',
      fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontWeight: '600',
      transition: 'all 0.3s ease',
      padding: '6px 0',
      borderBottom: '2px solid transparent',
      letterSpacing: '0.22em',
      textTransform: 'uppercase'
    },
    navLinkActive: {
      color: '#ff3300',
      borderBottom: '2px solid rgba(255,60,0,0.9)',
      textShadow: '0 0 12px rgba(255,60,0,0.9)'
    },
    userSection: {
      display: 'flex',
      alignItems: 'center',
      gap: '15px'
    },
    userInfo: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '6px 14px',
      background: 'rgba(0,0,0,0.9)',
      borderRadius: '999px',
      border: '1px solid rgba(255,40,0,0.35)',
      cursor: 'pointer',
      transition: 'all 0.3s ease'
    },
    userName: {
      color: '#ffffff',
      fontSize: '13px',
      fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontWeight: '500'
    },
    logoutBtn: {
      background: 'transparent',
      border: '1px solid rgba(255,60,0,0.7)',
      color: '#ff3300',
      padding: '6px 18px',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: '600',
      transition: 'all 0.3s ease'
    },
    networkPill: {
      fontFamily: "'Space Mono', monospace",
      fontSize: 11,
      borderRadius: 999,
      padding: '4px 10px',
      border: '1px solid rgba(255,60,0,0.9)',
      color: '#ff3300',
      background: 'rgba(0,0,0,0.9)',
      letterSpacing: '0.16em',
      textTransform: 'uppercase',
      marginRight: 10,
    },
    mobileToggle: {
      display: 'none',
      width: 32,
      height: 32,
      borderRadius: 999,
      border: '1px solid rgba(255,60,0,0.6)',
      background: 'rgba(0,0,0,0.9)',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer'
    },
    mobileLine: {
      width: 16,
      height: 2,
      background: '#ffffff',
      borderRadius: 2,
      boxShadow: '0 0 6px rgba(255,60,0,0.9)'
    },
    mobileDrawer: {
      position: 'fixed',
      top: 64,
      left: 0,
      right: 0,
      background: 'rgba(0,0,0,0.96)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(255,40,0,0.18)',
      padding: '16px 24px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      zIndex: 999
    }
  };

  const isActive = (path) => location.pathname === path;

  return (
    <nav style={styles.navbar}>
      <div style={styles.logo}>
        <div style={styles.logoIconWrap}>
          <svg viewBox="0 0 32 32" style={styles.logoHex}>
            <polygon points="16,2 27,8 27,20 16,26 5,20 5,8" />
          </svg>
        </div>
        <div style={styles.logoTextBox}>
          <span style={styles.logoTitle}>D·CHAT</span>
          <span style={styles.logoSubtitle}>DECENTRALIZED</span>
        </div>
      </div>
      
      <div style={{ ...styles.navLinks, display: 'flex' }}>
        <Link 
          to="/friends" 
          style={{
            ...styles.navLink,
            ...(isActive('/friends') ? styles.navLinkActive : {})
          }}
          onMouseEnter={(e) => e.target.style.color = '#ff8c42'}
          onMouseLeave={(e) => !isActive('/friends') && (e.target.style.color = '#b8b8d1')}
        >
          Friends
        </Link>
        <Link 
          to="/groups" 
          style={{
            ...styles.navLink,
            ...(isActive('/groups') ? styles.navLinkActive : {})
          }}
          onMouseEnter={(e) => e.target.style.color = '#ff8c42'}
          onMouseLeave={(e) => !isActive('/groups') && (e.target.style.color = '#b8b8d1')}
        >
          Groups
        </Link>
        <Link 
          to="/home" 
          style={{
            ...styles.navLink,
            ...(isActive('/home') ? styles.navLinkActive : {})
          }}
          onMouseEnter={(e) => e.target.style.color = '#ff8c42'}
          onMouseLeave={(e) => !isActive('/home') && (e.target.style.color = '#b8b8d1')}
        >
          CHAT
        </Link>
        <Link 
          to="/calls" 
          style={{
            ...styles.navLink,
            ...(isActive('/calls') ? styles.navLinkActive : {})
          }}
          onMouseEnter={(e) => e.target.style.color = '#ff8c42'}
          onMouseLeave={(e) => !isActive('/calls') && (e.target.style.color = '#b8b8d1')}
        >
          CALLS
        </Link>
        <Link 
          to="/contact" 
          style={styles.navLink}
          onMouseEnter={(e) => e.target.style.color = '#ff8c42'}
          onMouseLeave={(e) => e.target.style.color = '#b8b8d1'}
        >
          CONTACT
        </Link>
      </div>

      <div style={styles.userSection}>
        <span style={styles.networkPill}>SEPOLIA</span>
        <Link to="/profile" style={{ textDecoration: 'none' }}>
          <div 
            style={styles.userInfo}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0,0,0,0.98)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(0,0,0,0.9)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <HumanAvatar address={walletAddress || username || '0x0'} size={28} />
            <span style={styles.userName}>{username || 'User'}</span>
          </div>
        </Link>
        
        <button
          onClick={onLogout}
          style={styles.logoutBtn}
          onMouseEnter={(e) => {
            e.target.style.background = 'rgba(255,60,0,0.16)';
            e.target.style.color = '#ffffff';
            e.target.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'transparent';
            e.target.style.color = '#ff3300';
            e.target.style.transform = 'scale(1)';
          }}
        >
          Logout
        </button>

        <div
          style={styles.mobileToggle}
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <div style={styles.mobileLine} />
        </div>
      </div>

      {mobileOpen && (
        <div style={styles.mobileDrawer}>
          <Link 
            to="/friends" 
            style={{
              ...styles.navLink,
              ...(isActive('/friends') ? styles.navLinkActive : {})
            }}
            onClick={() => setMobileOpen(false)}
          >
            Friends
          </Link>
          <Link 
            to="/groups" 
            style={{
              ...styles.navLink,
              ...(isActive('/groups') ? styles.navLinkActive : {})
            }}
            onClick={() => setMobileOpen(false)}
          >
            Groups
          </Link>
          <Link 
            to="/home" 
            style={{
              ...styles.navLink,
              ...(isActive('/home') ? styles.navLinkActive : {})
            }}
            onClick={() => setMobileOpen(false)}
          >
            Chat
          </Link>
          <Link 
            to="/calls" 
            style={{
              ...styles.navLink,
              ...(isActive('/calls') ? styles.navLinkActive : {})
            }}
            onClick={() => setMobileOpen(false)}
          >
            Calls
          </Link>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
