import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/Login";
import Home from "./pages/Home";
import Chat from "./pages/Chat";
import Friends from "./pages/Friends";
import Groups from "./pages/Groups";
import GroupChat from "./pages/GroupChat";
import Calls from "./pages/Calls";
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
    localStorage.removeItem("walletAddress");
    localStorage.removeItem("username");
  };

  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={
            walletAddress ? (
              <Navigate to="/friends" />
            ) : (
              <Login setWalletAddress={setWalletAddress} />
            )
          }
        />
        <Route
          path="/friends"
          element={
            walletAddress ? (
              <Friends walletAddress={walletAddress} onLogout={handleLogout} />
            ) : (
              <Navigate to="/" />
            )
          }
        />
        <Route
          path="/groups"
          element={
            walletAddress ? (
              <Groups walletAddress={walletAddress} onLogout={handleLogout} />
            ) : (
              <Navigate to="/" />
            )
          }
        />
        <Route
          path="/group-chat/:groupId"
          element={
            walletAddress ? (
              <GroupChat walletAddress={walletAddress} onLogout={handleLogout} />
            ) : (
              <Navigate to="/" />
            )
          }
        />
        <Route
          path="/all-users"
          element={<Navigate to="/friends" />}
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
        <Route
          path="/calls"
          element={
            walletAddress ? (
              <Calls walletAddress={walletAddress} onLogout={handleLogout} />
            ) : (
              <Navigate to="/" />
            )
          }
        />
        <Route
          path="/contact"
          element={walletAddress ? <Navigate to="/friends" /> : <Navigate to="/" />}
        />
        <Route
          path="/settings"
          element={walletAddress ? <Navigate to="/friends" /> : <Navigate to="/" />}
        />
        <Route
          path="/faqs"
          element={walletAddress ? <Navigate to="/friends" /> : <Navigate to="/" />}
        />
        <Route
          path="/terms"
          element={walletAddress ? <Navigate to="/friends" /> : <Navigate to="/" />}
        />
      </Routes>
    </Router>
  );
}

export default App;