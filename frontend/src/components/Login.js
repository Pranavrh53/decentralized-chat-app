import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { initWeb3, storeMessageMetadata, getMessageMetadata } from "../utils/blockchain";

const Login = ({ setWalletAddress }) => {
  const navigate = useNavigate();
  const [account, setAccount] = useState(localStorage.getItem("walletAddress") || "");
  const [loading, setLoading] = useState(false);

  const handleConnectWallet = async () => {
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

      // Save wallet info locally
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

      navigate("/home");
    } catch (err) {
      console.error("❌ Wallet connection failed:", err);
      alert("Error connecting to wallet. Check console for details.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "80px" }}>
      <h1>Welcome to Decentralized Chat!</h1>

      {account ? (
        <p style={{ fontSize: "18px", color: "green" }}>
          ✅ Connected: {account.slice(0, 6)}...{account.slice(-4)}
        </p>
      ) : (
        <button
          onClick={handleConnectWallet}
          disabled={loading}
          style={{
            padding: "12px 24px",
            backgroundColor: loading ? "#6c757d" : "#007bff",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "16px",
            marginTop: "20px",
          }}
        >
          {loading ? "Connecting..." : "🔗 Connect Wallet"}
        </button>
      )}
    </div>
  );
};

export default Login;
