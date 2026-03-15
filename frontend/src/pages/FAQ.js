import React from "react";
import Navbar from "../components/Navbar";

const FAQ = ({ walletAddress, onLogout }) => {
  const username = localStorage.getItem("username") || "Anonymous";

  const styles = {
    page: {
      minHeight: "100vh",
      background: "#000000",
      color: "#ffffff",
    },
    content: {
      maxWidth: 980,
      margin: "0 auto",
      padding: "96px 24px 40px",
      fontFamily:
        "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    },
    sectionCard: {
      background: "rgba(0,0,0,0.75)",
      borderRadius: 24,
      border: "1px solid rgba(255,40,0,0.15)",
      padding: "24px 24px 20px",
      boxShadow: "0 40px 120px rgba(0,0,0,0.9)",
      marginBottom: 24,
    },
    headingTitle: {
      fontFamily: "'Space Mono', monospace",
      fontSize: 22,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      marginBottom: 6,
    },
    headingSub: {
      fontSize: 13,
      color: "rgba(255,255,255,0.5)",
      marginBottom: 16,
    },
    list: {
      margin: 0,
      paddingLeft: 18,
      fontSize: 14,
      lineHeight: 1.7,
      color: "rgba(255,255,255,0.82)",
    },
    qHeading: {
      fontSize: 15,
      fontWeight: 600,
      marginTop: 14,
      marginBottom: 4,
    },
    answer: {
      fontSize: 14,
      color: "rgba(255,255,255,0.7)",
    },
    pill: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "4px 10px",
      borderRadius: 999,
      border: "1px solid rgba(255,60,0,0.7)",
      fontSize: 11,
      fontFamily: "'Space Mono', monospace",
      letterSpacing: "0.16em",
      textTransform: "uppercase",
      color: "#ff3300",
      marginBottom: 12,
    },
  };

  return (
    <div style={styles.page}>
      <Navbar
        username={username}
        walletAddress={walletAddress}
        onLogout={onLogout}
      />

      <div style={styles.content}>
        <section style={styles.sectionCard}>
          <div style={styles.pill}>
            <span>FAQ</span>
            <span>HOW D·CHAT WORKS</span>
          </div>
          <h1 style={styles.headingTitle}>Using D·Chat</h1>
          <p style={styles.headingSub}>
            A quick walkthrough of the main flows: login, friends, chats,
            groups, calls, and profile.
          </p>

          <ol style={styles.list}>
            <li>
              <strong>Connect your wallet</strong> — On the login screen,
              choose a username and connect with MetaMask (Sepolia) or enter an
              Ethereum address manually.
            </li>
            <li>
              <strong>Add friends</strong> — Go to <em>Friends</em>, search or
              paste a wallet address, and add them so they appear in your
              sidebar.
            </li>
            <li>
              <strong>Start a 1‑1 chat</strong> — From <em>Friends</em> or{" "}
              <em>Home</em>, open a friend. Messages are sent P2P via WebRTC and
              also stored on-chain + IPFS for durability.
            </li>
            <li>
              <strong>Use group chat</strong> — In <em>Groups</em>, create a
              group on-chain, invite members, and send group messages/files
              that are recorded on-chain with IPFS content.
            </li>
            <li>
              <strong>Make calls</strong> — In <em>Calls</em>, pick a friend and
              start an audio or video call. Media flows peer‑to‑peer over
              WebRTC, coordinated by your Ethereum identities.
            </li>
            <li>
              <strong>Manage your profile</strong> — In <em>Profile</em>,
              update your username, avatar, and bio. Profile metadata is pinned
              to IPFS and can be reused across frontends.
            </li>
          </ol>
        </section>

        <section style={styles.sectionCard}>
          <h2 style={styles.headingTitle}>Common questions</h2>
          <p style={styles.headingSub}>
            Answers to some of the most frequent questions about the app.
          </p>

          <div>
            <div style={styles.qHeading}>
              Is my chat fully decentralized?
            </div>
            <p style={styles.answer}>
              Messages are delivered instantly via WebRTC peer‑to‑peer channels
              and anchored on the Sepolia testnet with IPFS content. The only
              centralized piece is the WebRTC signaling service; message content
              itself never lives on a traditional server.
            </p>

            <div style={styles.qHeading}>
              What happens if I clear my browser cache?
            </div>
            <p style={styles.answer}>
              Group chats and on‑chain 1‑1 chats are reconstructed from the
              smart contract and IPFS, so they survive cache clears as long as
              the underlying transactions were confirmed on Sepolia.
            </p>

            <div style={styles.qHeading}>
              Why do I need Sepolia ETH?
            </div>
            <p style={styles.answer}>
              Any on‑chain action (storing message metadata, adding on‑chain
              friends, creating groups) requires gas. D·Chat uses the Sepolia
              testnet so you can experiment safely with test ETH.
            </p>

            <div style={styles.qHeading}>
              Can I use D·Chat without MetaMask?
            </div>
            <p style={styles.answer}>
              Yes. On the login page you can choose manual address mode. You
              won&#39;t be able to send on‑chain transactions from that
              address, but P2P chat and some local features will still work.
            </p>

            <div style={styles.qHeading}>
              How do I report an issue or suggest a feature?
            </div>
            <p style={styles.answer}>
              Use the <strong>Contact</strong> link in the navbar to see the
              current support channel (e.g. GitHub issues, email, or Discord).
              Include your browser, network, and an example transaction hash if
              applicable.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default FAQ;

