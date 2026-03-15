import React, { useEffect, useState, useMemo } from "react";
import Navbar from "../components/Navbar";
import {
  initWeb3,
  getWeb3,
  getDynamicGasPrice,
  getRecentTransactions
} from "../utils/blockchain";
import {
  uploadJsonToIPFS,
  uploadFileToIPFS,
  retrieveFromIPFS,
  getIPFSFileUrl,
  isImageFile
} from "../utils/ipfs";
import { setPresenceHeartbeat } from "../utils/gunDB";

const Profile = ({ walletAddress, onLogout }) => {
  const [username, setUsername] = useState(localStorage.getItem("username") || "");
  const [bio, setBio] = useState(
    localStorage.getItem(`profile_bio_${walletAddress}`) || ""
  );
  const [avatarEmoji, setAvatarEmoji] = useState(
    localStorage.getItem(`profile_avatar_${walletAddress}`) || "🧑"
  );
  const [avatarImageHash, setAvatarImageHash] = useState(
    localStorage.getItem(`profile_avatar_ipfs_${walletAddress}`) || ""
  );
  const [avatarImageUrl, setAvatarImageUrl] = useState(
    avatarImageHash ? getIPFSFileUrl(avatarImageHash) : ""
  );
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [presenceStatus, setPresenceStatus] = useState("offline");

  const [balance, setBalance] = useState(null);
  const [networkName, setNetworkName] = useState("Loading...");
  const [gasPriceGwei, setGasPriceGwei] = useState(null);
  const [recentTx, setRecentTx] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [txLoading, setTxLoading] = useState(false);

  // Derived short wallet for preview card
  const shortWallet = useMemo(() => {
    if (!walletAddress) return "";
    return `${walletAddress.substring(0, 6)}...${walletAddress.slice(-4)}`;
  }, [walletAddress]);

  // Presence heartbeat (GunDB-based, no centralized presence server)
  useEffect(() => {
    if (!walletAddress) return;

    const stop = setPresenceHeartbeat(walletAddress);
    // Locally consider user online while heartbeat is active
    setPresenceStatus("online");

    return () => {
      stop();
      setPresenceStatus("offline");
    };
  }, [walletAddress]);

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

        // Recent transactions – live from Sepolia via Etherscan
        setTxLoading(true);
        const txs = await getRecentTransactions(walletAddress, 5);
        setRecentTx(txs || []);
        setTxLoading(false);
      } catch (e) {
        console.error("Error loading profile dashboard:", e);
        setError(e.message || "Failed to load wallet data");
        setTxLoading(false);
      } finally {
        setLoading(false);
      }
    };

    if (walletAddress) {
      loadOnChainData();
    }
  }, [walletAddress]);

  // Load decentralized profile metadata from IPFS (if hash is cached locally)
  useEffect(() => {
    const loadProfileFromIPFS = async () => {
      const cachedHash =
        localStorage.getItem(`profile_ipfs_hash_${walletAddress}`) || "";
      if (!cachedHash) return;

      try {
        setProfileLoading(true);
        setProfileError("");
        const json = await retrieveFromIPFS(cachedHash);

        if (json.username) setUsername(json.username);
        if (json.bio) setBio(json.bio);
        if (json.avatar && typeof json.avatar === "string") {
          const hash = json.avatar.replace("ipfs://", "");
          setAvatarImageHash(hash);
          setAvatarImageUrl(getIPFSFileUrl(hash));
          localStorage.setItem(`profile_avatar_ipfs_${walletAddress}`, hash);
        }
      } catch (err) {
        console.error("Error loading profile from IPFS:", err);
        setProfileError(err.message || "Failed to load profile metadata");
      } finally {
        setProfileLoading(false);
      }
    };

    if (walletAddress) {
      loadProfileFromIPFS();
    }
  }, [walletAddress]);

  const handleSaveProfile = async () => {
    try {
      if (!walletAddress) return;

      // Immediate local persistence for snappy UX
      localStorage.setItem("username", username);
      localStorage.setItem(`profile_bio_${walletAddress}`, bio);
      localStorage.setItem(`profile_avatar_${walletAddress}`, avatarEmoji);

      setProfileLoading(true);
      setProfileError("");

      const profileJson = {
        username: username || "",
        avatar: avatarImageHash ? `ipfs://${avatarImageHash}` : "",
        bio: bio || "",
        wallet: walletAddress,
        twitter: "",
        github: ""
      };

      const ipfsHash = await uploadJsonToIPFS(profileJson);
      localStorage.setItem(`profile_ipfs_hash_${walletAddress}`, ipfsHash);
      // NOTE: Smart contract storage of this hash can be wired here once
      // a profile function exists on-chain.
    } catch (err) {
      console.error("Error saving decentralized profile:", err);
      setProfileError(err.message || "Failed to save profile to IPFS");
    } finally {
      setProfileLoading(false);
    }
  };

  const handleAvatarFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!isImageFile(file.type)) {
      setProfileError("Avatar must be an image file");
      return;
    }

    try {
      setAvatarUploading(true);
      setProfileError("");
      const result = await uploadFileToIPFS(file, {
        sender: walletAddress,
        timestamp: new Date().toISOString()
      });
      setAvatarImageHash(result.ipfsHash);
      setAvatarImageUrl(result.url);
      localStorage.setItem(
        `profile_avatar_ipfs_${walletAddress}`,
        result.ipfsHash
      );
    } catch (err) {
      console.error("Error uploading avatar:", err);
      setProfileError(err.message || "Failed to upload avatar");
    } finally {
      setAvatarUploading(false);
    }
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
      background: "#000000",
      color: "#fff",
    },
    content: {
      maxWidth: 1200,
      margin: "0 auto",
      padding: "96px 24px 40px",
      display: "grid",
      gridTemplateColumns: "minmax(0, 2.1fr) minmax(0, 1.4fr)",
      gap: 28,
    },
    section: {
      background: "rgba(0,0,0,0.75)",
      borderRadius: 24,
      border: "1px solid rgba(255,40,0,0.15)",
      padding: "22px 22px 20px",
      boxShadow: "0 40px 120px rgba(0,0,0,0.9)",
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: 600,
      marginBottom: 12,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: "rgba(255,235,230,0.95)",
    },
    muted: {
      fontSize: 13,
      color: "rgba(255,255,255,0.55)",
    },
    statGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0,1fr))",
      gap: 14,
      marginTop: 16,
    },
    statCard: {
      background:
        "radial-gradient(circle at top, rgba(255,60,0,0.25), rgba(0,0,0,0.9))",
      borderRadius: 14,
      padding: "12px 12px 11px",
      border: "1px solid rgba(255,100,40,0.4)",
    },
    statLabel: {
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: "0.09em",
      color: "rgba(255,200,180,0.75)",
      marginBottom: 4,
    },
    statValue: {
      fontSize: 16,
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
      fontSize: 11,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "rgba(255,220,210,0.9)",
    },
    profileRow: {
      display: "flex",
      gap: 18,
      marginTop: 14,
      alignItems: "flex-start",
    },
    avatarCircle: {
      width: 96,
      height: 96,
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 44,
      background:
        "radial-gradient(circle at 30% 20%, #ffb199 0%, #ff0844 45%, #1a0000 100%)",
      boxShadow: "0 0 40px rgba(255,80,20,0.7)",
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
        "0 18px 50px rgba(0,0,0,0.85), 0 0 26px rgba(255,140,80,0.6)",
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
    previewCard: {
      marginTop: 18,
      padding: "14px 14px 12px",
      borderRadius: 18,
      border: "1px solid rgba(255,40,0,0.35)",
      background:
        "radial-gradient(circle at top left, rgba(255,60,0,0.15), rgba(0,0,0,0.9))",
      display: "flex",
      alignItems: "center",
      gap: 12,
    },
    previewAvatar: {
      width: 52,
      height: 52,
      borderRadius: "50%",
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background:
        "radial-gradient(circle at 30% 20%, #ffb199 0%, #ff0844 45%, #1a0000 100%)",
      boxShadow: "0 0 24px rgba(255,80,20,0.6)",
      flexShrink: 0,
    },
    previewAvatarImg: {
      width: "100%",
      height: "100%",
      objectFit: "cover",
    },
    previewUsername: {
      fontSize: 15,
      fontWeight: 600,
      marginBottom: 2,
    },
    previewBio: {
      fontSize: 12,
      color: "rgba(255,255,255,0.6)",
      maxWidth: 220,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    previewWallet: {
      fontSize: 11,
      color: "rgba(255,255,255,0.5)",
      fontFamily: "SF Mono, Menlo, Monaco, monospace",
    },
    presenceBadge: (status) => ({
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 9px",
      borderRadius: 999,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: "0.12em",
      border:
        status === "online"
          ? "1px solid rgba(22,163,74,0.8)"
          : "1px solid rgba(148,163,184,0.6)",
      background:
        status === "online"
          ? "rgba(5,46,22,0.9)"
          : "rgba(15,23,42,0.9)",
      color: status === "online" ? "#4ade80" : "#e5e7eb",
    }),
  };

  return (
    <div style={styles.page}>
      <Navbar
        username={username}
        walletAddress={walletAddress}
        onLogout={onLogout}
      />

      <div style={styles.content}>
        {/* Left: Wallet dashboard + account activity */}
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
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background:
                        presenceStatus === "online"
                          ? "rgba(34,197,94,0.9)"
                          : "#6b7280",
                    }}
                  />
                  <span>
                    {presenceStatus === "online" ? "Connected" : "Offline"}
                  </span>
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
                <span style={styles.muted}>Sepolia · last 5 tx</span>
              </div>
              {txLoading ? (
                <p style={styles.muted}>Loading recent transactions…</p>
              ) : recentTx.length === 0 ? (
                <p style={styles.muted}>
                  No recent Sepolia transactions found for this wallet.
                </p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {recentTx.map((tx) => (
                    <li
                      key={tx.hash}
                      style={{
                        padding: "9px 0",
                        borderBottom: "1px solid rgba(255,255,255,0.05)",
                        fontSize: 13,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 2,
                        }}
                      >
                        <span
                          style={{
                            textTransform: "uppercase",
                            fontSize: 11,
                            letterSpacing: "0.12em",
                            color:
                              tx.type === "send"
                                ? "#f97316"
                                : tx.type === "receive"
                                ? "#22c55e"
                                : "#e5e7eb",
                          }}
                        >
                          {tx.type || "contract"}
                        </span>
                        <a
                          href={`https://sepolia.etherscan.io/tx/${tx.hash}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            fontSize: 11,
                            color: "#93c5fd",
                            textDecoration: "none",
                          }}
                        >
                          View on Etherscan ↗
                        </a>
                      </div>
                      <div style={styles.muted}>
                        {tx.hash
                          ? `${tx.hash.substring(0, 10)}…${tx.hash.slice(-6)}`
                          : "—"}
                      </div>
                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 11,
                          color: "rgba(148,163,184,0.85)",
                        }}
                      >
                        Gas used: {tx.gasUsed || "—"} ·{" "}
                        {tx.timeStamp
                          ? new Date(tx.timeStamp * 1000).toLocaleString()
                          : "Unknown time"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section style={{ ...styles.section, marginTop: 20 }}>
            <h2 style={styles.sectionTitle}>Account Overview</h2>
            <p style={styles.muted}>
              Snapshot of your profile, wallet, and decentralized presence.
            </p>
            <div style={styles.previewCard}>
              <div style={styles.previewAvatar}>
                {avatarImageUrl ? (
                  <img
                    src={avatarImageUrl}
                    alt="Avatar"
                    style={styles.previewAvatarImg}
                  />
                ) : (
                  <span>{avatarEmoji}</span>
                )}
              </div>
              <div>
                <div style={styles.previewUsername}>
                  {username || "Unnamed user"}
                </div>
                <div style={styles.previewBio}>
                  {bio || "No bio set yet."}
                </div>
                <div style={styles.previewWallet}>{shortWallet}</div>
              </div>
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
              <span style={styles.presenceBadge(presenceStatus)}>
                <span
                  style={{
                    display: "inline-block",
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background:
                      presenceStatus === "online"
                        ? "rgba(34,197,94,0.9)"
                        : "#6b7280",
                  }}
                />
                {presenceStatus === "online" ? "Online" : "Offline"}
              </span>
              <span style={styles.pillSubtle}>
                {balance !== null
                  ? `${Number(balance).toFixed(4)} ETH`
                  : "Balance loading…"}
              </span>
            </div>
          </section>
        </div>

        {/* Right: Profile + wallet QR */}
        <div>
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Profile</h2>
            <p style={styles.muted}>
              Decentralized profile stored on IPFS. Avatar, bio, and identity
              stay portable across frontends.
            </p>

            {profileError && (
              <p
                style={{
                  ...styles.muted,
                  color: "#f97373",
                  marginTop: 8,
                }}
              >
                {profileError}
              </p>
            )}

            <div style={styles.profileRow}>
              <div
                style={{
                  ...styles.avatarCircle,
                  position: "relative",
                  cursor: "pointer",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.03)";
                  e.currentTarget.style.boxShadow =
                    "0 0 48px rgba(255,120,40,0.9)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.boxShadow =
                    "0 0 40px rgba(255,80,20,0.7)";
                }}
              >
                {avatarImageUrl ? (
                  <img
                    src={avatarImageUrl}
                    alt="Avatar"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      borderRadius: "50%",
                    }}
                  />
                ) : (
                  <span>{avatarEmoji}</span>
                )}
                <label
                  htmlFor="avatar-upload-input"
                  style={{
                    position: "absolute",
                    bottom: -4,
                    right: -4,
                    padding: "4px 6px",
                    borderRadius: 999,
                    background: "rgba(0,0,0,0.85)",
                    border: "1px solid rgba(255,255,255,0.3)",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  {avatarUploading ? "Uploading…" : "Change"}
                </label>
                <input
                  id="avatar-upload-input"
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleAvatarFileChange}
                />
              </div>
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
                  {profileLoading ? "Saving to IPFS…" : "Save profile"}
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

