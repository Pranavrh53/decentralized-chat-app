import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { initWeb3, storeMessageMetadata, getMessageMetadata } from "../utils/blockchain";
import ThermodynamicGrid from "./ThermodynamicGrid";

const Login = ({ setWalletAddress }) => {
  const navigate = useNavigate();
  const [account, setAccount] = useState(localStorage.getItem("walletAddress") || "");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [useManualMode, setUseManualMode] = useState(false);
  const [manualAddress, setManualAddress] = useState("");

  const registerUser = (address, name) => {
    const allUsers = JSON.parse(localStorage.getItem("allChatUsers") || "[]");
    if (!allUsers.find(u => u.address.toLowerCase() === address.toLowerCase())) {
      allUsers.push({ username: name, address, joinedAt: new Date().toISOString() });
      localStorage.setItem("allChatUsers", JSON.stringify(allUsers));
    }
    localStorage.setItem("username", name);
  };

  const handleConnectWallet = async () => {
    if (!username.trim()) { alert("Please enter your username first"); return; }
    setLoading(true);
    try {
      const { web3, account, contract, error } = await initWeb3();
      if (error) { alert(`❌ Error: ${error}`); setLoading(false); return; }
      if (!account) { alert("No wallet account detected."); setLoading(false); return; }
      registerUser(account, username);
      setAccount(account);
      setWalletAddress(account);
      localStorage.setItem("walletAddress", account);
      const receiver = "0x0000000000000000000000000000000000000000";
      const messageHash = web3.utils.sha3("Hello blockchain!");
      await storeMessageMetadata(account, receiver, messageHash);
      await getMessageMetadata(0);
      navigate("/all-users");
    } catch (err) {
      console.error("❌ Wallet connection failed:", err);
      alert("Error connecting to wallet. Check console for details.");
    } finally { setLoading(false); }
  };

  const handleManualLogin = () => {
    if (!username.trim()) { alert("Please enter your username first"); return; }
    if (!manualAddress.trim() || manualAddress.length < 42) { alert("Please enter a valid Ethereum address"); return; }
    registerUser(manualAddress, username);
    setAccount(manualAddress);
    setWalletAddress(manualAddress);
    localStorage.setItem("walletAddress", manualAddress);
    navigate("/all-users");
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box}

        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes breathe{0%,100%{opacity:.8}50%{opacity:1}}

        /* ── split root ── */
        .lg-root{
          display:flex; width:100%; min-height:100vh;
          font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
          background:#000;
          position:relative;
          overflow:hidden;
        }

        /* ══════ LEFT PANEL — form + heatmap bg ══════ */
        .lg-left{
          width:50%; position:relative; overflow:hidden;
          display:flex; align-items:center; justify-content:center;
          padding:48px 40px;
          background:transparent;
          z-index:2;
        }

        /* glass card on left */
        .lg-card{
          position:relative; z-index:2;
          width:100%; max-width:420px;
          background:rgba(0,0,0,.55);
          backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px);
          border:1px solid rgba(255,40,0,.15);
          border-radius:24px;
          padding:44px 36px;
          box-shadow:0 30px 80px rgba(0,0,0,.7), 0 0 40px rgba(180,20,0,.08);
          animation:fadeUp .7s ease forwards;
        }

        /* logo */
        .lg-logo{display:flex;align-items:center;gap:14px;margin-bottom:32px;opacity:0;animation:fadeUp .5s ease forwards .1s}
        .lg-logo-icon{
          width:44px;height:44px;border-radius:14px;background:#fff;color:#000;
          display:flex;align-items:center;justify-content:center;font-size:22px;
          box-shadow:0 4px 20px rgba(255,255,255,.15);
        }
        .lg-logo-text{
          font-size:20px;font-weight:700;color:#fff;letter-spacing:-.3px;
          font-family:'Space Mono',monospace;
        }

        /* heading */
        .lg-heading{margin-bottom:4px;opacity:0;animation:fadeUp .5s ease forwards .2s}
        .lg-heading h1{
          font-size:26px;font-weight:700;color:#fff;margin:0;letter-spacing:-.5px;
          font-family:'Space Mono',monospace;
        }
        .lg-heading p{font-size:14px;color:rgba(255,255,255,.4);margin:8px 0 0;line-height:1.6}

        /* connected */
        .lg-connected{
          margin-top:24px;padding:16px;
          background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);
          border-radius:14px;opacity:0;animation:fadeUp .5s ease forwards .3s;
        }
        .lg-connected-addr{font-size:14px;color:#fff;font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px}
        .lg-connected-dot{width:8px;height:8px;border-radius:50%;background:#fff;box-shadow:0 0 8px rgba(255,255,255,.6);animation:breathe 2s ease-in-out infinite}

        /* form */
        .lg-form{margin-top:24px;display:flex;flex-direction:column}
        .lg-field{opacity:0;animation:fadeUp .5s ease forwards}
        .lg-field:nth-child(1){animation-delay:.3s}
        .lg-field:nth-child(2){animation-delay:.4s}
        .lg-field:nth-child(3){animation-delay:.5s}
        .lg-field:nth-child(4){animation-delay:.6s}

        .lg-label{display:block;font-size:12px;font-weight:600;color:rgba(255,255,255,.45);margin-bottom:8px;letter-spacing:.6px;text-transform:uppercase}
        .lg-input{
          width:100%;padding:13px 16px;font-size:15px;font-family:inherit;
          border:1px solid rgba(255,255,255,.1);border-radius:12px;outline:none;
          transition:all .25s ease;margin-bottom:18px;
          background:rgba(255,255,255,.04);color:#fff;
        }
        .lg-input::placeholder{color:rgba(255,255,255,.18)}
        .lg-input:focus{
          border-color:rgba(255,60,0,.4);
          box-shadow:0 0 0 3px rgba(200,30,0,.1);
          background:rgba(255,255,255,.07);
        }
        .lg-input.mono{font-family:'SF Mono',Consolas,Monaco,monospace;font-size:14px}

        /* primary btn */
        .lg-btn{
          width:100%;padding:14px 24px;font-size:15px;font-weight:600;font-family:inherit;
          color:#000;border:none;border-radius:12px;cursor:pointer;
          transition:all .3s ease;position:relative;overflow:hidden;
          background:#fff;box-shadow:0 4px 20px rgba(255,255,255,.12);
          display:flex;align-items:center;justify-content:center;gap:10px;
        }
        .lg-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 8px 30px rgba(255,255,255,.2)}
        .lg-btn:active:not(:disabled){transform:translateY(0)}
        .lg-btn:disabled{opacity:.5;cursor:not-allowed}
        .lg-btn .btn-shimmer{
          position:absolute;top:0;left:0;width:100%;height:100%;
          background:linear-gradient(90deg,transparent,rgba(0,0,0,.04),transparent);
          background-size:200% 100%;animation:shimmer 3s ease-in-out infinite;pointer-events:none;
        }

        /* outline btn */
        .lg-btn-outline{
          width:100%;padding:14px 24px;font-size:15px;font-weight:600;font-family:inherit;
          color:#fff;border:1px solid rgba(255,60,0,.35);border-radius:12px;cursor:pointer;
          transition:all .3s ease;background:transparent;
          display:flex;align-items:center;justify-content:center;gap:10px;
        }
        .lg-btn-outline:hover{
          border-color:rgba(255,80,0,.6);
          background:rgba(200,20,0,.08);
          transform:translateY(-1px);
        }

        /* divider */
        .lg-divider{display:flex;align-items:center;margin:20px 0;opacity:0;animation:fadeUp .5s ease forwards .55s}
        .lg-divider-line{flex:1;height:1px;background:rgba(255,255,255,.07)}
        .lg-divider-text{padding:0 16px;font-size:11px;font-weight:600;color:rgba(255,255,255,.2);text-transform:uppercase;letter-spacing:1.5px}

        /* switch */
        .lg-switch{
          display:block;text-align:center;font-size:14px;color:rgba(255,255,255,.35);
          cursor:pointer;transition:all .25s ease;padding:10px;border-radius:10px;margin-top:4px;
          opacity:0;animation:fadeUp .5s ease forwards .65s;
        }
        .lg-switch:hover{color:#fff;background:rgba(255,255,255,.04)}

        /* features */
        .lg-features{margin-top:28px;display:flex;flex-direction:column;gap:8px;opacity:0;animation:fadeUp .5s ease forwards .7s}
        .lg-feat{display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.03);transition:all .3s ease}
        .lg-feat:hover{background:rgba(255,255,255,.03);border-color:rgba(255,255,255,.06);transform:translateX(4px)}
        .lg-feat-icon{width:30px;height:30px;border-radius:8px;background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
        .lg-feat-text{font-size:12px;color:rgba(255,255,255,.35);font-weight:500}

        /* spinner */
        .lg-spinner{width:18px;height:18px;border:2px solid rgba(255,255,255,.2);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite}

        /* ══════ RIGHT PANEL — image ══════ */
        .lg-right{
          width:50%; position:relative; overflow:hidden;
          display:flex; align-items:center; justify-content:center;
          background:transparent;
          z-index:2;
        }
        .lg-right img{
          width:75%; max-width:420px;
          filter:drop-shadow(0 0 80px rgba(200,30,0,.2));
          opacity:.9;
        }
        .lg-right-overlay{
          position:absolute;inset:0;
          background:radial-gradient(circle at 50% 50%,transparent 30%,rgba(0,0,0,.7) 100%);
          pointer-events:none;
        }
        .lg-right-content{position:absolute;bottom:50px;left:48px;right:48px;z-index:2}
        .lg-right-badge{
          display:inline-flex;align-items:center;gap:6px;padding:6px 14px;
          border-radius:50px;background:rgba(200,20,0,.12);
          border:1px solid rgba(255,60,0,.2);color:rgba(255,255,255,.7);
          font-size:12px;font-weight:600;letter-spacing:.5px;margin-bottom:16px;
          font-family:'Space Mono',monospace;
        }
        .lg-right-title{
          font-size:28px;font-weight:700;color:#fff;line-height:1.3;margin:0 0 10px;letter-spacing:-.5px;
          font-family:'Space Mono',monospace;
        }
        .lg-right-desc{font-size:14px;color:rgba(255,255,255,.35);line-height:1.6;margin:0;max-width:380px}

        /* connected dot override for red glow */
        .lg-connected-dot{background:#ff3300;box-shadow:0 0 8px rgba(255,50,0,.7);}

        /* responsive */
        @media(max-width:900px){
          .lg-root{flex-direction:column}
          .lg-left{width:100%;padding:32px 24px}
          .lg-right{display:none}
        }
      `}</style>

      <div className="lg-root">
        <ThermodynamicGrid resolution={12} coolingFactor={0.96} />

        {/* ══════ LEFT — Form Card ══════ */}
        <div className="lg-left">
          <div className="lg-card">
            <div className="lg-logo">
              <div className="lg-logo-icon">🔐</div>
              <div className="lg-logo-text">Decentralized Chat</div>
            </div>

            <div className="lg-heading">
              <h1>Welcome back</h1>
              <p>Sign in with your wallet to access secure, peer-to-peer messaging on the blockchain.</p>
            </div>

            {account && !useManualMode ? (
              <div className="lg-connected">
                <div className="lg-connected-addr">
                  <div className="lg-connected-dot" />
                  Connected: {account.slice(0, 6)}...{account.slice(-4)}
                </div>
                <button className="lg-btn" onClick={() => navigate("/all-users")}>
                  <span className="btn-shimmer" />
                  Continue to Chat →
                </button>
              </div>
            ) : (
              <div className="lg-form">
                <div className="lg-field">
                  <label className="lg-label">Username</label>
                  <input type="text" placeholder="Enter your display name" value={username} onChange={(e) => setUsername(e.target.value)} className="lg-input" />
                </div>

                {!useManualMode ? (
                  <>
                    <div className="lg-field">
                      <button className="lg-btn-outline" onClick={handleConnectWallet} disabled={loading} style={{ opacity: loading ? 0.5 : 1 }}>
                        {loading ? (<><div className="lg-spinner" /> Connecting...</>) : (<>🦊 Connect MetaMask Wallet</>)}
                      </button>
                    </div>
                    <div className="lg-divider">
                      <div className="lg-divider-line" />
                      <span className="lg-divider-text">Or</span>
                      <div className="lg-divider-line" />
                    </div>
                    <div className="lg-switch" onClick={() => setUseManualMode(true)}>📝 Enter wallet address manually</div>
                  </>
                ) : (
                  <>
                    <div className="lg-field">
                      <label className="lg-label">Wallet Address</label>
                      <input type="text" placeholder="0x..." value={manualAddress} onChange={(e) => setManualAddress(e.target.value)} className="lg-input mono" />
                    </div>
                    <div className="lg-field">
                      <button className="lg-btn" onClick={handleManualLogin}>
                        <span className="btn-shimmer" />Continue with Address →
                      </button>
                    </div>
                    <div className="lg-switch" onClick={() => setUseManualMode(false)}>🦊 Use MetaMask instead</div>
                  </>
                )}
              </div>
            )}

            <div className="lg-features">
              <div className="lg-feat"><div className="lg-feat-icon">🔒</div><span className="lg-feat-text">End-to-end encrypted messages</span></div>
              <div className="lg-feat"><div className="lg-feat-icon">⛓️</div><span className="lg-feat-text">Blockchain-verified identity</span></div>
              <div className="lg-feat"><div className="lg-feat-icon">🚀</div><span className="lg-feat-text">Peer-to-peer WebRTC connections</span></div>
            </div>
          </div>
        </div>

        {/* ══════ RIGHT — Logo Image ══════ */}
        <div className="lg-right">
          <div className="lg-right-overlay" />
          <img src="/dapp_network_logo.png" alt="Decentralized network" />
          <div className="lg-right-content">
            <div className="lg-right-badge">⚡ Decentralized & Secure</div>
            <h2 className="lg-right-title">Your messages,<br />your control.</h2>
            <p className="lg-right-desc">No central servers. No data harvesting. Just secure, peer-to-peer communication powered by blockchain technology.</p>
          </div>
        </div>
      </div>
    </>
  );
};

export default Login;