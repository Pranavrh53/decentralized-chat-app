import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { initWeb3, storeMessageMetadata, getMessageMetadata } from "../utils/blockchain";

/* ─────────────────────────────────────────
   ThermodynamicGrid — attached to window,
   NOT to a container div, so it truly covers
   the whole viewport including behind panels.
───────────────────────────────────────── */
const ThermodynamicGrid = ({ resolution = 14, coolingFactor = 0.965 }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let grid, cols, rows, width, height, animId;
    const mouse = { x: -9999, y: -9999, prevX: -9999, prevY: -9999, active: false };

    const getThermalColor = (t) => {
      const r = Math.min(255, Math.max(0, t * 2.5 * 255));
      const g = Math.min(255, Math.max(0, (t * 2.5 - 1) * 255));
      const b = Math.min(255, Math.max(0, (t * 2.5 - 2) * 255 + t * 50));
      return `rgb(${r + 10},${g + 10},${b + 15})`;
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      cols = Math.ceil(width / resolution);
      rows = Math.ceil(height / resolution);
      grid = new Float32Array(cols * rows).fill(0);
    };

    const onMouseMove = (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    };
    const onMouseLeave = () => { mouse.active = false; };

    const update = () => {
      if (mouse.active) {
        const dx = mouse.x - mouse.prevX, dy = mouse.y - mouse.prevY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.ceil(dist / (resolution / 2));
        for (let s = 0; s <= steps; s++) {
          const t = steps > 0 ? s / steps : 0;
          const x = mouse.prevX + dx * t, y = mouse.prevY + dy * t;
          const col = Math.floor(x / resolution), row = Math.floor(y / resolution);
          const radius = 3;
          for (let i = -radius; i <= radius; i++) {
            for (let j = -radius; j <= radius; j++) {
              const c = col + i, r = row + j;
              if (c >= 0 && c < cols && r >= 0 && r < rows) {
                const d = Math.sqrt(i * i + j * j);
                if (d <= radius)
                  grid[c + r * cols] = Math.min(1, grid[c + r * cols] + 0.35 * (1 - d / radius));
              }
            }
          }
        }
      }
      mouse.prevX = mouse.x;
      mouse.prevY = mouse.y;

      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, width, height);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = c + r * cols;
          const temp = grid[idx];
          grid[idx] *= coolingFactor;
          if (temp > 0.05) {
            const x = c * resolution, y = r * resolution;
            const size = resolution * (0.75 + temp * 0.55);
            const offset = (resolution - size) / 2;
            ctx.fillStyle = getThermalColor(temp);
            ctx.fillRect(x + offset, y + offset, size, size);
          } else if (c % 2 === 0 && r % 2 === 0) {
            ctx.fillStyle = "#111115";
            ctx.fillRect(c * resolution + resolution / 2 - 1, r * resolution + resolution / 2 - 1, 2, 2);
          }
        }
      }
      animId = requestAnimationFrame(update);
    };

    resize();
    update();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseleave", onMouseLeave);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [resolution, coolingFactor]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0, left: 0,
        width: "100vw", height: "100vh",
        zIndex: 0,
        display: "block",
        pointerEvents: "none",
      }}
    />
  );
};

/* ─────────────────────────────────────────
   Professional hex-network SVG logo
───────────────────────────────────────── */
const LogoMark = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="11" fill="white"/>
    <polygon points="20,7 29,12 29,22 20,27 11,22 11,12" fill="none" stroke="#111" strokeWidth="1.7"/>
    <line x1="20" y1="7"  x2="20" y2="14.5" stroke="#111" strokeWidth="1.4"/>
    <line x1="29" y1="12" x2="22.5" y2="15.5" stroke="#111" strokeWidth="1.4"/>
    <line x1="29" y1="22" x2="22.5" y2="18.5" stroke="#111" strokeWidth="1.4"/>
    <line x1="20" y1="27" x2="20" y2="19.5" stroke="#111" strokeWidth="1.4"/>
    <line x1="11" y1="22" x2="17.5" y2="18.5" stroke="#111" strokeWidth="1.4"/>
    <line x1="11" y1="12" x2="17.5" y2="15.5" stroke="#111" strokeWidth="1.4"/>
    <circle cx="20" cy="17" r="3" fill="#111"/>
    <circle cx="20" cy="7.2" r="1.4" fill="#111"/>
    <circle cx="28.8" cy="12" r="1.4" fill="#111"/>
    <circle cx="28.8" cy="22" r="1.4" fill="#111"/>
    <circle cx="20" cy="26.8" r="1.4" fill="#111"/>
    <circle cx="11.2" cy="22" r="1.4" fill="#111"/>
    <circle cx="11.2" cy="12" r="1.4" fill="#111"/>
    <circle cx="30" cy="30" r="4.5" fill="#ff3300"/>
    <circle cx="30" cy="30" r="2"   fill="white"/>
  </svg>
);

/* ─────────────────────────────────────────
   Login
───────────────────────────────────────── */
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
      const { web3, account, error } = await initWeb3();
      if (error) { alert(`Error: ${error}`); setLoading(false); return; }
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
      console.error("Wallet connection failed:", err);
      alert("Error connecting to wallet.");
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
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,300&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes fadeUp  { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes glow    { 0%,100%{opacity:.5} 50%{opacity:1} }
        @keyframes floatY  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-9px)} }

        /* page wrapper — sits above canvas (z:0) */
        .lp-page {
          position: relative;
          width: 100vw;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 24px;
          font-family: 'DM Sans', sans-serif;
          z-index: 1;
        }

        /* scanlines */
        .lp-page::before {
          content:'';
          position: fixed; inset: 0;
          z-index: 2; pointer-events: none;
          background: repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.05) 3px,rgba(0,0,0,.05) 4px);
        }
        /* vignette */
        .lp-page::after {
          content:'';
          position: fixed; inset: 0;
          z-index: 2; pointer-events: none;
          background: radial-gradient(ellipse 80% 80% at 50% 50%, transparent 30%, rgba(0,0,0,.7) 100%);
        }

        /* card shell — above overlays */
        .lp-shell {
          position: relative;
          z-index: 3;
          display: grid;
          grid-template-columns: 1fr 1fr;
          width: 100%;
          max-width: 1080px;
          min-height: 660px;
          border-radius: 22px;
          border: 1px solid rgba(255,36,0,.2);
          overflow: hidden;
          box-shadow:
            0 0 0 1px rgba(0,0,0,.5),
            0 48px 120px rgba(0,0,0,.85),
            inset 0 0 60px rgba(255,16,0,.025);
          animation: fadeUp .6s ease forwards;
        }

        /* ── LEFT ── */
        .lp-brand {
          background: rgba(6,6,6,.82);
          border-right: 1px solid rgba(255,36,0,.1);
          padding: 52px 50px 46px;
          display: flex;
          flex-direction: column;
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }
        .lp-logo { display:flex; align-items:center; gap:13px; }
        .lp-logo-name {
          font-family:'IBM Plex Mono',monospace;
          font-size:16px; font-weight:600; color:#fff; letter-spacing:.3px;
        }
        .lp-logo-sub {
          font-size:10px; color:rgba(255,255,255,.25);
          letter-spacing:2px; text-transform:uppercase; margin-top:2px;
        }

        .lp-hero { flex:1; display:flex; flex-direction:column; justify-content:center; padding:44px 0 32px; }
        .lp-tag {
          font-family:'IBM Plex Mono',monospace;
          font-size:10px; font-weight:500; letter-spacing:3px; text-transform:uppercase;
          color:rgba(255,52,0,.75); margin-bottom:18px;
          display:flex; align-items:center; gap:10px;
        }
        .lp-tag::after { content:''; flex:1; height:1px; background:rgba(255,52,0,.18); }
        .lp-h1 {
          font-size:42px; font-weight:600; line-height:1.1;
          color:#fff; letter-spacing:-1.5px; margin-bottom:20px;
        }
        .lp-h1 em { font-style:italic; font-weight:300; color:rgba(255,255,255,.25); }
        .lp-desc {
          font-size:13.5px; font-weight:300;
          color:rgba(255,255,255,.3); line-height:1.8; max-width:300px;
        }

        .lp-img { display:flex; align-items:center; justify-content:center; padding:26px 0; }
        .lp-img img {
          width:62%; max-width:195px;
          filter: drop-shadow(0 0 50px rgba(200,24,0,.38)) drop-shadow(0 0 14px rgba(255,70,0,.2));
          animation: floatY 5s ease-in-out infinite;
          opacity:.9;
        }

        .lp-feats { display:flex; flex-direction:column; gap:10px; }
        .lp-feat { display:flex; align-items:center; gap:10px; font-size:12px; color:rgba(255,255,255,.27); }
        .lp-feat-dot { width:5px; height:5px; border-radius:50%; background:rgba(255,46,0,.55); flex-shrink:0; }

        /* ── RIGHT ── */
        .lp-form {
          background: rgba(9,9,9,.88);
          padding: 52px 54px;
          display: flex; flex-direction: column; justify-content: center;
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
        }

        .fh { margin-bottom:36px; opacity:0; animation:fadeUp .5s ease forwards .08s; }
        .fh h2 {
          font-family:'IBM Plex Mono',monospace;
          font-size:27px; font-weight:600; color:#fff;
          letter-spacing:-.7px; margin-bottom:9px;
        }
        .fh p { font-size:13px; font-weight:300; color:rgba(255,255,255,.29); line-height:1.65; }

        /* connected */
        .addr-badge {
          display:inline-flex; align-items:center; gap:9px;
          padding:9px 16px;
          background:rgba(255,255,255,.033);
          border:1px solid rgba(255,255,255,.07);
          border-radius:50px;
          font-family:'IBM Plex Mono',monospace; font-size:13px;
          color:rgba(255,255,255,.52); margin-bottom:16px; width:fit-content;
        }
        .addr-dot {
          width:8px; height:8px; border-radius:50%;
          background:#ff3300; animation:glow 2s ease-in-out infinite;
          box-shadow:0 0 6px rgba(255,46,0,.7);
        }

        .fl { display:block; font-size:10.5px; font-weight:600; letter-spacing:1.8px;
              text-transform:uppercase; color:rgba(255,255,255,.26);
              margin-bottom:9px; font-family:'IBM Plex Mono',monospace; }

        .fi {
          width:100%; padding:13px 17px; font-size:14px;
          font-family:'DM Sans',sans-serif;
          background:rgba(255,255,255,.028);
          border:1px solid rgba(255,255,255,.07);
          border-radius:11px; color:#fff; outline:none;
          transition:border-color .2s, background .2s, box-shadow .2s;
          margin-bottom:20px; -webkit-appearance:none;
        }
        .fi::placeholder { color:rgba(255,255,255,.12); }
        .fi:focus {
          border-color:rgba(255,40,0,.38);
          background:rgba(255,255,255,.048);
          box-shadow:0 0 0 3px rgba(200,16,0,.1);
        }
        .fi.mono { font-family:'IBM Plex Mono',monospace; font-size:12.5px; letter-spacing:.3px; }

        .fbtn {
          width:100%; padding:14px 20px;
          font-size:14.5px; font-weight:600; font-family:'DM Sans',sans-serif;
          background:#fff; color:#000;
          border:none; border-radius:11px; cursor:pointer;
          display:flex; align-items:center; justify-content:center; gap:9px;
          transition:opacity .2s, transform .15s, box-shadow .2s;
          box-shadow:0 2px 20px rgba(255,255,255,.07);
        }
        .fbtn:hover:not(:disabled) { opacity:.91; transform:translateY(-1px); box-shadow:0 6px 28px rgba(255,255,255,.13); }
        .fbtn:active:not(:disabled) { transform:translateY(0); }
        .fbtn:disabled { opacity:.36; cursor:not-allowed; }

        .fbtn-o {
          width:100%; padding:14px 20px;
          font-size:14.5px; font-weight:500; font-family:'DM Sans',sans-serif;
          background:transparent; color:rgba(255,255,255,.7);
          border:1px solid rgba(255,34,0,.3); border-radius:11px; cursor:pointer;
          display:flex; align-items:center; justify-content:center; gap:9px;
          transition:all .22s;
        }
        .fbtn-o:hover:not(:disabled) {
          border-color:rgba(255,52,0,.65);
          background:rgba(200,14,0,.07);
          color:#fff; transform:translateY(-1px);
        }
        .fbtn-o:disabled { opacity:.36; cursor:not-allowed; }

        .fdiv { display:flex; align-items:center; gap:14px; margin:20px 0; }
        .fdiv-l { flex:1; height:1px; background:rgba(255,255,255,.052); }
        .fdiv-t {
          font-size:10px; font-weight:600; letter-spacing:2.5px; text-transform:uppercase;
          color:rgba(255,255,255,.15); font-family:'IBM Plex Mono',monospace;
        }

        .fswitch {
          display:block; text-align:center; font-size:13px;
          color:rgba(255,255,255,.2); cursor:pointer;
          padding:8px; border-radius:8px; margin-top:12px;
          transition:color .2s, background .2s;
        }
        .fswitch:hover { color:rgba(255,255,255,.52); background:rgba(255,255,255,.03); }

        .fspinner {
          width:16px; height:16px;
          border:2px solid rgba(0,0,0,.15);
          border-top-color:#000;
          border-radius:50%; animation:spin .55s linear infinite;
        }

        .fa1{opacity:0;animation:fadeUp .45s ease forwards .1s}
        .fa2{opacity:0;animation:fadeUp .45s ease forwards .22s}
        .fa3{opacity:0;animation:fadeUp .45s ease forwards .34s}
        .fa4{opacity:0;animation:fadeUp .45s ease forwards .46s}

        @media(max-width:860px){
          .lp-shell{grid-template-columns:1fr;max-width:500px;min-height:auto;}
          .lp-brand{display:none;}
          .lp-form{padding:44px 34px;}
        }
        @media(max-width:480px){
          .lp-form{padding:36px 22px;}
          .lp-page{padding:16px;}
        }
      `}</style>

      {/* z-index 0 — full viewport canvas */}
      <ThermodynamicGrid resolution={14} coolingFactor={0.965} />

      {/* z-index 1 — page content (scanlines/vignette via ::before/::after at z:2) */}
      <div className="lp-page">
        <div className="lp-shell">

          {/* ═══ LEFT ═══ */}
          <div className="lp-brand">
            <div className="lp-logo">
              <LogoMark />
              <div>
                <div className="lp-logo-name">DChat</div>
                <div className="lp-logo-sub">Protocol</div>
              </div>
            </div>

            <div className="lp-hero">
              <div className="lp-tag">P2P Network</div>
              <h1 className="lp-h1">Your messages,<br /><em>your control.</em></h1>
              <p className="lp-desc">No central servers. No data harvesting. Secure peer-to-peer communication powered by blockchain.</p>
            </div>

            <div className="lp-img">
              <img src="/dapp_network_logo.png" alt="Decentralized network" />
            </div>

            <div className="lp-feats">
              {[
                "End-to-end encrypted messages",
                "Blockchain-verified identity",
                "Peer-to-peer WebRTC connections",
              ].map(t => (
                <div className="lp-feat" key={t}>
                  <div className="lp-feat-dot" />{t}
                </div>
              ))}
            </div>
          </div>

          {/* ═══ RIGHT ═══ */}
          <div className="lp-form">
            <div className="fh">
              <h2>Welcome back</h2>
              <p>Sign in with your Ethereum wallet to access secure, decentralized messaging.</p>
            </div>

            {account && !useManualMode ? (
              <div className="fa1" style={{display:"flex",flexDirection:"column",gap:14}}>
                <div className="addr-badge">
                  <div className="addr-dot" />
                  {account.slice(0,6)}…{account.slice(-4)}
                </div>
                <button className="fbtn" onClick={() => navigate("/all-users")}>
                  Continue to Chat →
                </button>
              </div>
            ) : (
              <>
                <div className="fa1">
                  <label className="fl">Username</label>
                  <input
                    type="text" placeholder="Enter your display name"
                    value={username} onChange={e => setUsername(e.target.value)}
                    className="fi"
                  />
                </div>

                {!useManualMode ? (
                  <>
                    <div className="fa2">
                      <button className="fbtn-o" onClick={handleConnectWallet} disabled={loading}>
                        {loading ? <><div className="fspinner"/>Connecting…</> : <>🦊 Connect MetaMask</>}
                      </button>
                    </div>
                    <div className="fdiv fa3">
                      <div className="fdiv-l"/><span className="fdiv-t">or</span><div className="fdiv-l"/>
                    </div>
                    <div className="fa4">
                      <span className="fswitch" onClick={() => setUseManualMode(true)}>
                        Enter wallet address manually →
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="fa2">
                      <label className="fl">Wallet Address</label>
                      <input
                        type="text" placeholder="0x…"
                        value={manualAddress} onChange={e => setManualAddress(e.target.value)}
                        className="fi mono"
                      />
                    </div>
                    <div className="fa3">
                      <button className="fbtn" onClick={handleManualLogin}>
                        Continue with Address →
                      </button>
                    </div>
                    <span className="fswitch fa4" onClick={() => setUseManualMode(false)}>
                      ← Use MetaMask instead
                    </span>
                  </>
                )}
              </>
            )}
          </div>

        </div>
      </div>
    </>
  );
};

export default Login;