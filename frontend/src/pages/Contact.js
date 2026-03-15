import React from "react";
import Navbar from "../components/Navbar";

const Contact = ({ walletAddress, onLogout }) => {
  const username = localStorage.getItem("username") || "Anonymous";

  const styles = {
    page: {
      minHeight: "100vh",
      background: "#000000",
      color: "#ffffff",
    },
    content: {
      maxWidth: 780,
      margin: "0 auto",
      padding: "96px 24px 40px",
      fontFamily:
        "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    },
    card: {
      background: "rgba(0,0,0,0.75)",
      borderRadius: 24,
      border: "1px solid rgba(255,40,0,0.15)",
      padding: "24px 24px 20px",
      boxShadow: "0 40px 120px rgba(0,0,0,0.9)",
    },
    headingTitle: {
      fontFamily: "'Space Mono', monospace",
      fontSize: 20,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      marginBottom: 6,
    },
    headingSub: {
      fontSize: 13,
      color: "rgba(255,255,255,0.5)",
      marginBottom: 18,
    },
    label: {
      fontSize: 12,
      color: "rgba(255,255,255,0.55)",
      textTransform: "uppercase",
      letterSpacing: "0.16em",
      marginBottom: 6,
    },
    value: {
      fontSize: 14,
      color: "rgba(255,255,255,0.85)",
      marginBottom: 12,
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
        <div style={styles.card}>
          <div style={styles.pill}>Support · Feedback</div>
          <h1 style={styles.headingTitle}>Contact</h1>
          <p style={styles.headingSub}>
            This page describes how to reach the maintainer of this DApp and
            what information to include when you report an issue.
          </p>

          <div style={{ marginBottom: 18 }}>
            <div style={styles.label}>Best way to report a bug</div>
            <div style={styles.value}>
              Open an issue on the project repository (e.g. GitHub) or send an
              email to the maintainer with screenshots and console logs. Include
              your browser, wallet address, and whether you were on Sepolia.
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={styles.label}>What to include</div>
            <div style={styles.value}>
              1) Brief description of the problem. 2) Exact steps to reproduce.
              3) Transaction hashes (for any failing on‑chain actions). 4)
              Screenshots of any visible errors. 5) The network (Sepolia /
              other) and browser version.
            </div>
          </div>

          <div>
            <div style={styles.label}>Feature requests</div>
            <div style={styles.value}>
              If you have ideas for new functionality (e.g. new call modes,
              moderation tools, or integrations), describe the use case in as
              much detail as possible so it can be evaluated and prioritized.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;

