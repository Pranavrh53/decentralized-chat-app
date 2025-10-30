import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/Login";
import Home from "./pages/Home";
import Chat from "./pages/Chat";
import { initWeb3 } from "./utils/blockchain";

function App() {
  const [walletAddress, setWalletAddress] = useState(localStorage.getItem("walletAddress") || "");

  // Sync wallet address with localStorage
  useEffect(() => {
    if (walletAddress) {
      localStorage.setItem("walletAddress", walletAddress);
    } else {
      localStorage.removeItem("walletAddress");
    }
  }, [walletAddress]);

  // Auto-connect wallet on page load
  useEffect(() => {
    const setup = async () => {
      if (window.ethereum && walletAddress) {
        try {
          const { account } = await initWeb3();
          if (account && account.toLowerCase() !== walletAddress.toLowerCase()) {
            setWalletAddress(account);
          }
        } catch (error) {
          console.error("Auto-connect failed:", error);
          setWalletAddress(""); // Clear if there's an error
        }
      }
    };
    setup();

    // Listen for account changes
    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        // MetaMask is locked or user disconnected all accounts
        setWalletAddress("");
      } else if (accounts[0] !== walletAddress) {
        setWalletAddress(accounts[0]);
      }
    };

    if (window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
    }

    return () => {
      if (window.ethereum?.removeListener) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      }
    };
  }, [walletAddress]);

  const handleLogout = () => {
    setWalletAddress("");
  };

  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={
            walletAddress ? (
              <Navigate to="/home" />
            ) : (
              <Login setWalletAddress={setWalletAddress} />
            )
          }
        />
        <Route
          path="/home"
          element={
            walletAddress ? (
              <Home walletAddress={walletAddress} onLogout={handleLogout} />
            ) : (
              <Navigate to="/" />
            )
          }
        />
        <Route
          path="/chat/:friendAddress"
          element={
            walletAddress ? (
              <Chat walletAddress={walletAddress} onLogout={handleLogout} />
            ) : (
              <Navigate to="/" />
            )
          }
        />
      </Routes>
    </Router>
  );
}

export default App;