import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/Login";
import Home from "./pages/Home";
import Chat from "./pages/Chat";
import { initWeb3 } from "./utils/blockchain";

function App() {
  const [walletAddress, setWalletAddress] = useState(localStorage.getItem("walletAddress") || "");

  // Keep wallet address synced with localStorage
  useEffect(() => {
    if (walletAddress) {
      localStorage.setItem("walletAddress", walletAddress);
    } else {
      localStorage.removeItem("walletAddress");
    }
  }, [walletAddress]);

  // Optional: auto-connect wallet on page load
  useEffect(() => {
    const setup = async () => {
      if (window.ethereum && !walletAddress) {
        try {
          const { account } = await initWeb3();
          if (account) setWalletAddress(account);
        } catch (err) {
          console.warn("Auto-connect failed:", err);
        }
      }
    };
    setup();
  }, [walletAddress]);

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
          element={walletAddress ? <Home walletAddress={walletAddress} /> : <Navigate to="/" />}
        />
        <Route
          path="/chat/:friendAddress"
          element={walletAddress ? <Chat walletAddress={walletAddress} /> : <Navigate to="/" />}
        />
      </Routes>
    </Router>
  );
}

export default App;
