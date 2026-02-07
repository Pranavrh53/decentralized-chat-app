import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { initWeb3, storeMessageMetadata, getMessageMetadata } from "../utils/blockchain";

const Login = ({ setWalletAddress }) => {
  const navigate = useNavigate();
  const [account, setAccount] = useState(localStorage.getItem("walletAddress") || "");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [useManualMode, setUseManualMode] = useState(false);
  const [manualAddress, setManualAddress] = useState("");

  const registerUser = (address, name) => {
    // Add user to global users list
    const allUsers = JSON.parse(localStorage.getItem('allChatUsers') || '[]');
    const existingUser = allUsers.find(u => u.address.toLowerCase() === address.toLowerCase());
    
    if (!existingUser) {
      allUsers.push({
        username: name,
        address: address,
        joinedAt: new Date().toISOString()
      });
      localStorage.setItem('allChatUsers', JSON.stringify(allUsers));
    }
    
    localStorage.setItem("username", name);
  };

  const handleConnectWallet = async () => {
    if (!username.trim()) {
      alert("Please enter your username first");
      return;
    }

    setLoading(true);
    try {
      const { web3, account, contract, error } = await initWeb3();

      if (error) {
        alert(`❌ Error: ${error}`);
        setLoading(false);
        return;
      }

      if (!account) {
        alert("No wallet account detected. Please connect your wallet.");
        setLoading(false);
        return;
      }

      // Register and save wallet info
      registerUser(account, username);
      setAccount(account);
      setWalletAddress(account);
      localStorage.setItem("walletAddress", account);

      console.log("✅ Connected wallet:", account);
      console.log("🔗 Contract instance:", contract);

      // (Optional) Simple blockchain test to verify contract interaction
      const receiver = "0x0000000000000000000000000000000000000000"; // dummy address
      const messageHash = web3.utils.sha3("Hello blockchain!");
      await storeMessageMetadata(account, receiver, messageHash);

      const metadata = await getMessageMetadata(0);
      console.log("🧩 Retrieved metadata:", metadata);

      navigate("/all-users");
    } catch (err) {
      console.error("❌ Wallet connection failed:", err);
      alert("Error connecting to wallet. Check console for details.");
    } finally {
      setLoading(false);
    }
  };

  const handleManualLogin = () => {
    if (!username.trim()) {
      alert("Please enter your username first");
      return;
    }

    if (!manualAddress.trim() || manualAddress.length < 42) {
      alert("Please enter a valid Ethereum address");
      return;
    }

    // Register and save wallet info
    registerUser(manualAddress, username);
    setAccount(manualAddress);
    setWalletAddress(manualAddress);
    localStorage.setItem("walletAddress", manualAddress);

    navigate("/all-users");
  };

  const styles = {
    container: {
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #2d1b4e 100%)",
      backgroundSize: "200% 200%",
      animation: "gradientShift 15s ease infinite",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      padding: "20px",
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      position: "relative",
      overflow: "hidden"
    },
    card: {
      background: "linear-gradient(135deg, #1a1f3a 0%, #2d1b4e 100%)",
      borderRadius: "24px",
      boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(138, 102, 255, 0.2)",
      padding: "50px 40px",
      maxWidth: "450px",
      width: "100%",
      textAlign: "center",
      border: "1px solid rgba(138, 102, 255, 0.2)",
      backdropFilter: "blur(10px)",
      animation: "fadeIn 0.8s ease-out, glow 3s ease-in-out infinite",
      position: "relative",
      zIndex: 1
    },
    logo: {
      fontSize: "64px",
      marginBottom: "20px",
      animation: "float 3s ease-in-out infinite",
      textShadow: "0 0 30px rgba(138, 102, 255, 0.8)"
    },
    title: {
      fontSize: "32px",
      fontWeight: "700",
      color: "#ffffff",
      marginBottom: "10px",
      textShadow: "0 0 20px rgba(138, 102, 255, 0.5)"
    },
    subtitle: {
      fontSize: "16px",
      color: "#b8b8d1",
      marginBottom: "40px",
      lineHeight: "1.5"
    },
    button: {
      width: "100%",
      padding: "16px",
      background: "linear-gradient(135deg, #8a66ff 0%, #6644cc 100%)",
      color: "white",
      border: "none",
      borderRadius: "12px",
      fontSize: "16px",
      fontWeight: "600",
      cursor: "pointer",
      transition: "all 0.3s ease",
      marginBottom: "15px",
      boxShadow: "0 4px 15px rgba(138, 102, 255, 0.4)",
      position: "relative",
      overflow: "hidden"
    },
    buttonSecondary: {
      width: "100%",
      padding: "16px",
      backgroundColor: "transparent",
      color: "#8a66ff",
      border: "2px solid #8a66ff",
      borderRadius: "12px",
      fontSize: "16px",
      fontWeight: "600",
      cursor: "pointer",
      transition: "all 0.3s ease"
    },
    input: {
      width: "100%",
      padding: "14px 16px",
      fontSize: "16px",
      border: "2px solid rgba(138, 102, 255, 0.3)",
      borderRadius: "12px",
      outline: "none",
      transition: "all 0.3s ease",
      boxSizing: "border-box",
      marginBottom: "15px",
      backgroundColor: "rgba(26, 31, 58, 0.6)",
      color: "#ffffff",
      backdropFilter: "blur(5px)"
    },
    connectedText: {
      fontSize: "18px",
      color: "#4ade80",
      fontWeight: "600",
      marginBottom: "20px",
      textShadow: "0 0 10px rgba(74, 222, 128, 0.5)"
    },
    divider: {
      display: "flex",
      alignItems: "center",
      margin: "30px 0",
      color: "#b8b8d1",
      fontSize: "14px"
    },
    dividerLine: {
      flex: 1,
      height: "1px",
      background: "linear-gradient(90deg, transparent, rgba(138, 102, 255, 0.5), transparent)"
    },
    dividerText: {
      padding: "0 15px"
    },
    switchMode: {
      marginTop: "20px",
      fontSize: "14px",
      color: "#8a66ff",
      cursor: "pointer",
      textDecoration: "underline",
      transition: "all 0.3s ease"
    },
    features: {
      textAlign: "left",
      marginTop: "30px",
      padding: "20px",
      background: "rgba(26, 31, 58, 0.6)",
      borderRadius: "12px",
      border: "1px solid rgba(138, 102, 255, 0.2)",
      backdropFilter: "blur(5px)"
    },
    featureItem: {
      display: "flex",
      alignItems: "center",
      marginBottom: "10px",
      fontSize: "14px",
      color: "#b8b8d1"
    },
    featureIcon: {
      marginRight: "10px",
      fontSize: "18px"
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>🔐</div>
        <h1 style={styles.title}>Decentralized Chat</h1>
        <p style={styles.subtitle}>
          Secure, private, peer-to-peer messaging on the blockchain
        </p>

        {account && !useManualMode ? (
          <div>
            <p style={styles.connectedText}>
              ✅ Connected: {account.slice(0, 6)}...{account.slice(-4)}
            </p>
            <button
              onClick={() => navigate("/all-users")}
              style={styles.button}
              onMouseEnter={(e) => (e.target.style.transform = "scale(1.02)", e.target.style.boxShadow = "0 6px 25px rgba(138, 102, 255, 0.6)")}
              onMouseLeave={(e) => (e.target.style.transform = "scale(1)", e.target.style.boxShadow = "0 4px 15px rgba(138, 102, 255, 0.4)")}
            >
              Continue to Chat
            </button>
          </div>
        ) : (
          <div>
            {/* Username Input */}
            <input
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={styles.input}
              onFocus={(e) => e.target.style.borderColor = "#8a66ff"}
              onBlur={(e) => e.target.style.borderColor = "rgba(138, 102, 255, 0.3)"}
            />
            
            {!useManualMode ? (
              <>
                <button
                  onClick={handleConnectWallet}
                  disabled={loading}
                  style={{...styles.button, opacity: loading ? 0.6 : 1}}
                  onMouseEnter={(e) => !loading && (e.target.style.transform = "scale(1.02)", e.target.style.boxShadow = "0 6px 25px rgba(138, 102, 255, 0.6)")}
                  onMouseLeave={(e) => !loading && (e.target.style.transform = "scale(1)", e.target.style.boxShadow = "0 4px 15px rgba(138, 102, 255, 0.4)")}
                >
                  {loading ? "Connecting..." : "🦊 Connect MetaMask Wallet"}
                </button>
                
                <div style={styles.divider}>
                  <div style={styles.dividerLine}></div>
                  <span style={styles.dividerText}>OR</span>
                  <div style={styles.dividerLine}></div>
                </div>
                
                <div
                  onClick={() => setUseManualMode(true)}
                  style={styles.switchMode}
                >
                  📝 Enter Address Manually
                </div>
              </>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Enter Ethereum address (0x...)"
                  value={manualAddress}
                  onChange={(e) => setManualAddress(e.target.value)}
                  style={styles.input}
                  onFocus={(e) => e.target.style.borderColor = "#8a66ff"}
                  onBlur={(e) => e.target.style.borderColor = "rgba(138, 102, 255, 0.3)"}
                />
                <button
                  onClick={handleManualLogin}
                  style={styles.button}
                  onMouseEnter={(e) => (e.target.style.transform = "scale(1.02)", e.target.style.boxShadow = "0 6px 25px rgba(138, 102, 255, 0.6)")}
                  onMouseLeave={(e) => (e.target.style.transform = "scale(1)", e.target.style.boxShadow = "0 4px 15px rgba(138, 102, 255, 0.4)")}
                >
                  Continue with Address
                </button>
                
                <div
                  onClick={() => setUseManualMode(false)}
                  style={styles.switchMode}
                >
                  🦊 Use MetaMask Instead
                </div>
              </>
            )}
          </div>
        )}

        <div style={styles.features}>
          <div style={styles.featureItem}>
            <span style={styles.featureIcon}>🔒</span>
            <span>End-to-end encrypted messages</span>
          </div>
          <div style={styles.featureItem}>
            <span style={styles.featureIcon}>⛓️</span>
            <span>Blockchain-verified identity</span>
          </div>
          <div style={styles.featureItem}>
            <span style={styles.featureIcon}>🚀</span>
            <span>Peer-to-peer WebRTC connections</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;