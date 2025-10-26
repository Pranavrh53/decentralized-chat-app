// frontend/src/pages/Home.js
import React from "react";
import { Link } from "react-router-dom";

const Home = ({ walletAddress }) => {
  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h2>Welcome to Decentralized Chat!</h2>
      <p>Connected Wallet: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</p>

      {/* Example: Link to chat with a friend (replace with real address later) */}
      <Link to="/chat/0x1234567890abcdef1234" style={{ marginTop: "20px", display: "inline-block", padding: "10px 20px", backgroundColor: "#28a745", color: "white", borderRadius: "6px", textDecoration: "none" }}>
        Chat with Friend
      </Link>
    </div>
  );
};

export default Home;
