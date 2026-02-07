import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Navbar = ({ username, walletAddress, onLogout }) => {
  const location = useLocation();

  const getInitials = (name) => {
    if (!name) return '?';
    return name.substring(0, 2).toUpperCase();
  };

  const styles = {
    navbar: {
      background: 'linear-gradient(135deg, #1a1f3a 0%, #2d1b4e 100%)',
      padding: '15px 40px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottom: '1px solid rgba(138, 102, 255, 0.2)',
      position: 'sticky',
      top: 0,
      zIndex: 1000,
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
    },
    logo: {
      display: 'flex',
      alignItems: 'center',
      gap: '15px'
    },
    logoIcon: {
      width: '50px',
      height: '50px',
      background: 'linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '24px',
      boxShadow: '0 4px 15px rgba(138, 102, 255, 0.4)'
    },
    navLinks: {
      display: 'flex',
      gap: '40px',
      alignItems: 'center'
    },
    navLink: {
      color: '#b8b8d1',
      textDecoration: 'none',
      fontSize: '15px',
      fontWeight: '500',
      transition: 'all 0.3s ease',
      padding: '8px 0',
      borderBottom: '2px solid transparent',
      letterSpacing: '0.5px'
    },
    navLinkActive: {
      color: '#ff8c42',
      borderBottom: '2px solid #ff8c42'
    },
    userSection: {
      display: 'flex',
      alignItems: 'center',
      gap: '15px'
    },
    userInfo: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '8px 20px',
      background: 'rgba(138, 102, 255, 0.1)',
      borderRadius: '25px',
      border: '1px solid rgba(138, 102, 255, 0.3)',
      cursor: 'pointer',
      transition: 'all 0.3s ease'
    },
    avatar: {
      width: '35px',
      height: '35px',
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #ff8c42 0%, #ff6b35 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontSize: '14px',
      fontWeight: '600',
      boxShadow: '0 2px 10px rgba(255, 140, 66, 0.4)',
      animation: 'pulse 2s ease-in-out infinite'
    },
    userName: {
      color: '#ff8c42',
      fontSize: '15px',
      fontWeight: '600'
    },
    logoutBtn: {
      background: 'transparent',
      border: '2px solid #ef4444',
      color: '#ef4444',
      padding: '8px 20px',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: '600',
      transition: 'all 0.3s ease'
    }
  };

  const isActive = (path) => location.pathname === path;

  return (
    <nav style={styles.navbar}>
      <div style={styles.logo}>
        <div style={styles.logoIcon}>💬</div>
      </div>
      
      <div style={styles.navLinks}>
        <Link 
          to="/all-users" 
          style={{
            ...styles.navLink,
            ...(isActive('/all-users') ? styles.navLinkActive : {})
          }}
          onMouseEnter={(e) => e.target.style.color = '#ff8c42'}
          onMouseLeave={(e) => !isActive('/all-users') && (e.target.style.color = '#b8b8d1')}
        >
          All Users
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
          to="/contact" 
          style={styles.navLink}
          onMouseEnter={(e) => e.target.style.color = '#ff8c42'}
          onMouseLeave={(e) => e.target.style.color = '#b8b8d1'}
        >
          CONTACT
        </Link>
        <Link 
          to="/settings" 
          style={styles.navLink}
          onMouseEnter={(e) => e.target.style.color = '#ff8c42'}
          onMouseLeave={(e) => e.target.style.color = '#b8b8d1'}
        >
          SETTING
        </Link>
        <Link 
          to="/faqs" 
          style={styles.navLink}
          onMouseEnter={(e) => e.target.style.color = '#ff8c42'}
          onMouseLeave={(e) => e.target.style.color = '#b8b8d1'}
        >
          FAQS
        </Link>
        <Link 
          to="/terms" 
          style={styles.navLink}
          onMouseEnter={(e) => e.target.style.color = '#ff8c42'}
          onMouseLeave={(e) => e.target.style.color = '#b8b8d1'}
        >
          TERMS OF USE
        </Link>
      </div>

      <div style={styles.userSection}>
        <div 
          style={styles.userInfo}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(138, 102, 255, 0.2)';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(138, 102, 255, 0.1)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <div style={styles.avatar}>
            {getInitials(username)}
          </div>
          <span style={styles.userName}>{username || 'User'}</span>
        </div>
        
        <button
          onClick={onLogout}
          style={styles.logoutBtn}
          onMouseEnter={(e) => {
            e.target.style.background = '#ef4444';
            e.target.style.color = 'white';
            e.target.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'transparent';
            e.target.style.color = '#ef4444';
            e.target.style.transform = 'scale(1)';
          }}
        >
          Logout
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
