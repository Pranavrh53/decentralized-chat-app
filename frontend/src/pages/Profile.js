import React, { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import { initWeb3, getWeb3, getDynamicGasPrice } from "../utils/blockchain";

const Profile = ({ walletAddress, onLogout }) => {
  const [username, setUsername] = useState(localStorage.getItem("username") || "");
  const [bio, setBio] = useState(
    localStorage.getItem(`profile_bio_${walletAddress}`) || ""
  );
  const [avatarEmoji, setAvatarEmoji] = useState(
    localStorage.getItem(`profile_avatar_${walletAddress}`) || "🧑"
  );

  const [balance, setBalance] = useState(null);
  const [networkName, setNetworkName] = useState("Loading...");
  const [gasPriceGwei, setGasPriceGwei] = useState(null);
  const [recentTx, setRecentTx] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadOnChainData = async () => {
      try {
        setLoading(true);
        await initWeb3();
        const web3 = getWeb3();

        // Balance
        const rawBalance = await web3.eth.getBalance(walletAddress);
        setBalance(web3.utils.fromWei(rawBalance, "ether"));

        // Network
        const chainId = await web3.eth.getChainId();
        let name = `Chain ID ${chainId}`;
        if (chainId === 1) name = "Ethereum Mainnet";
        if (chainId === 11155111) name = "Sepolia Testnet";
        setNetworkName(name);

        // Gas tracker
        const gasWei = await getDynamicGasPrice(1.0);
        const gwei = web3.utils.fromWei(gasWei.toString(), "gwei");
        setGasPriceGwei(gwei);

        // Recent transactions – from localStorage if available
        const stored = localStorage.getItem(`recentTx_${walletAddress}`);
        if (stored) {
          setRecentTx(JSON.parse(stored));
        } else {
          setRecentTx([]);
        }
      } catch (e) {
        console.error("Error loading profile dashboard:", e);
        setError(e.message || "Failed to load wallet data");
      } finally {
        setLoading(false);
      }
    };

    if (walletAddress) {
      loadOnChainData();
    }
  }, [walletAddress]);

  const handleSaveProfile = () => {
    localStorage.setItem("username", username);
    localStorage.setItem(`profile_bio_${walletAddress}`, bio);
    localStorage.setItem(`profile_avatar_${walletAddress}`, avatarEmoji);
  };

  const copyAddress = () => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress).catch(() => {});
  };

  const qrSrc = walletAddress
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
        walletAddress
      )}`
    : "";

  const styles = {
    page: {
      minHeight: "100vh",
      background:
        "radial-gradient(circle at top left, #2d1b4e 0%, #0b1018 40%, #05070a 100%)",
      color: "#fff",
    },
    content: {
      maxWidth: "1200px",
      margin: "0 auto",
      padding: "32px 24px 40px",
      display: "grid",
      gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1.4fr)",
      gap: "28px",
    },
    section: {
      background: "rgba(10, 12, 20, 0.9)",
      borderRadius: "20px",
      border: "1px solid rgba(148, 27, 11, 0.4)",
      padding: "24px 22px",
      boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
    },
    sectionTitle: {
      fontSize: "18px",
      fontWeight: 600,
      marginBottom: "12px",
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: "rgba(255,235,230,0.95)",
    },
    muted: {
      fontSize: "13px",
      color: "rgba(255,255,255,0.55)",
    },
    statGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0,1fr))",
      gap: "14px",
      marginTop: "16px",
    },
    statCard: {
      background:
        "radial-gradient(circle at top, rgba(255,60,0,0.25), rgba(0,0,0,0.9))",
      borderRadius: "14px",
      padding: "12px 12px 11px",
      border: "1px solid rgba(255,100,40,0.4)",
    },
    statLabel: {
      fontSize: "11px",
      textTransform: "uppercase",
      letterSpacing: "0.09em",
      color: "rgba(255,200,180,0.75)",
      marginBottom: "4px",
    },
    statValue: {
      fontSize: "16px",
      fontWeight: 600,
    },
    pill: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      borderRadius: 999,
      padding: "6px 12px",
      background: "rgba(255,60,0,0.12)",
      border: "1px solid rgba(255,90,30,0.4)",
      fontSize: "11px",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "rgba(255,220,210,0.9)",
    },
    profileRow: {
      display: "flex",
      gap: "18px",
      marginTop: "14px",
      alignItems: "flex-start",
    },
    avatarCircle: {
      width: 64,
      height: 64,
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 34,
      background:
        "radial-gradient(circle at 30% 20%, #ffb199 0%, #ff0844 45%, #1a0000 100%)",
      boxShadow: "0 0 30px rgba(255,80,20,0.55)",
      flexShrink: 0,
    },
    input: {
      width: "100%",
      padding: "10px 12px",
      borderRadius: "10px",
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(8,10,16,0.9)",
      color: "#fff",
      fontSize: 14,
      outline: "none",
      marginBottom: 10,
    },
    textarea: {
      width: "100%",
      minHeight: 80,
      padding: "10px 12px",
      borderRadius: "10px",
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(8,10,16,0.9)",
      color: "#fff",
      fontSize: 14,
      outline: "none",
      resize: "vertical",
    },
    saveBtn: {
      marginTop: 10,
      padding: "10px 18px",
      borderRadius: 999,
      border: "none",
      background:
        "linear-gradient(135deg, #ffffff 0%, #ffe4dd 40%, #ff9c66 100%)",
      color: "#140400",
      fontWeight: 600,
      fontSize: 14,
      cursor: "pointer",
      boxShadow:
        "0 16px 45px rgba(0,0,0,0.75), 0 0 20px rgba(255,140,80,0.45)",
    },
    walletRow: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginTop: 10,
      padding: "10px 12px",
      borderRadius: 12,
      background: "rgba(5,7,12,0.9)",
      border: "1px solid rgba(255,255,255,0.08)",
      fontFamily: "SF Mono, Menlo, Monaco, monospace",
      fontSize: 12,
    },
    copyBtn: {
      padding: "6px 10px",
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.25)",
      background: "transparent",
      color: "#fff",
      fontSize: 11,
      cursor: "pointer",
    },
    qrWrapper: {
      marginTop: 14,
      padding: "10px 10px 6px",
      borderRadius: 16,
      border: "1px dashed rgba(255,90,20,0.6)",
      background: "radial-gradient(circle at top, #200000, #050506)",
      display: "inline-flex",
    },
    notifList: {
      marginTop: 14,
      display: "flex",
      flexDirection: "column",
      gap: 10,
    },
    notifItem: {
      padding: "10px 12px",
      borderRadius: 12,
      background: "rgba(12,16,24,0.9)",
      border: "1px solid rgba(255,255,255,0.06)",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      fontSize: 13,
    },
    pillSubtle: {
      padding: "4px 9px",
      borderRadius: 999,
      fontSize: 11,
      border: "1px solid rgba(255,255,255,0.2)",
      color: "rgba(255,255,255,0.8)",
    },
  };

  const notifications = [
    {
      id: "msg-requests",
      label: "Message requests",
      detail: "No new message requests.",
    },
    {
      id: "friend-requests",
      label: "Friend requests",
      detail: "No pending friend requests.",
    },
    {
      id: "onchain",
      label: "On‑chain alerts",
      detail: "No recent on‑chain alerts.",
    },
  ];

  return (
    <div style={styles.page}>
      <Navbar
        username={username}
        walletAddress={walletAddress}
        onLogout={onLogout}
      />

      <div style={styles.content}>
        {/* Left: Wallet dashboard + notifications */}
        <div>
          <section style={styles.section}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <h2 style={styles.sectionTitle}>Wallet Dashboard</h2>
                <p style={styles.muted}>
                  Live view of your connected wallet, network, and gas.
                </p>
              </div>
              <span style={styles.pill}>
                <span>●</span>
                <span>Connected</span>
              </span>
            </div>

            {error && (
              <p style={{ ...styles.muted, color: "#ff6b6b", marginTop: 10 }}>
                {error}
              </p>
            )}

            <div style={styles.statGrid}>
              <div style={styles.statCard}>
                <div style={styles.statLabel}>Balance</div>
                <div style={styles.statValue}>
                  {loading || balance === null ? "…" : `${Number(balance).toFixed(4)} ETH`}
                </div>
              </div>
              <div style={styles.statCard}>
                <div style={styles.statLabel}>Network</div>
                <div style={styles.statValue}>{networkName}</div>
              </div>
              <div style={styles.statCard}>
                <div style={styles.statLabel}>Gas (est.)</div>
                <div style={styles.statValue}>
                  {loading || gasPriceGwei === null
                    ? "…"
                    : `${Number(gasPriceGwei).toFixed(1)} gwei`}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 22 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <span style={{ fontWeight: 500, fontSize: 14 }}>
                  Recent on‑chain activity
                </span>
                <span style={styles.muted}>local preview only</span>
              </div>
              {recentTx.length === 0 ? (
                <p style={styles.muted}>
                  No recent transactions stored locally for this wallet.
                </p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {recentTx.slice(0, 4).map((tx) => (
                    <li
                      key={tx.hash}
                      style={{
                        padding: "8px 0",
                        borderBottom: "1px solid rgba(255,255,255,0.05)",
                        fontSize: 13,
                      }}
                    >
                      <div>{tx.description || "Transaction"}</div>
                      <div style={styles.muted}>
                        {tx.hash
                          ? `${tx.hash.substring(0, 10)}…${tx.hash.slice(-6)}`
                          : "—"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section style={{ ...styles.section, marginTop: 20 }}>
            <h2 style={styles.sectionTitle}>Notifications</h2>
            <p style={styles.muted}>
              Message requests, friend requests, and on‑chain alerts will appear
              here.
            </p>
            <div style={styles.notifList}>
              {notifications.map((n) => (
                <div key={n.id} style={styles.notifItem}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{n.label}</div>
                    <div style={styles.muted}>{n.detail}</div>
                  </div>
                  <span style={styles.pillSubtle}>0 new</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right: Profile + wallet QR */}
        <div>
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Profile</h2>
            <p style={styles.muted}>
              Update your display identity and share your wallet with a QR code.
            </p>

            <div style={styles.profileRow}>
              <div style={styles.avatarCircle}>{avatarEmoji}</div>
              <div style={{ flex: 1 }}>
                <input
                  style={styles.input}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Display name"
                />
                <textarea
                  style={styles.textarea}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Short bio, status, or note…"
                />
                <button type="button" style={styles.saveBtn} onClick={handleSaveProfile}>
                  Save profile
                </button>
              </div>
            </div>

            <div style={{ marginTop: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 500, fontSize: 14 }}>
                  Your wallet address
                </span>
                <span style={styles.muted}>Scan or copy to share</span>
              </div>

              <div style={styles.walletRow}>
                <span style={{ opacity: 0.7 }}>0x</span>
                <span>
                  {walletAddress
                    ? `${walletAddress.substring(2, 8)}…${walletAddress.slice(-6)}`
                    : "Not connected"}
                </span>
                <button type="button" style={styles.copyBtn} onClick={copyAddress}>
                  Copy
                </button>
              </div>

              {walletAddress && (
                <div style={styles.qrWrapper}>
                  <img
                    src={qrSrc}
                    alt="Wallet QR"
                    width={180}
                    height={180}
                    style={{ borderRadius: 12 }}
                  />
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Profile;

