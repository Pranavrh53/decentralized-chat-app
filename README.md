# 💬 Decentralized Peer-to-Peer Chat Application

[![React](https://img.shields.io/badge/Frontend-React-blue?logo=react)](https://react.dev/)
[![Solidity](https://img.shields.io/badge/Smart_Contract-Solidity-black?logo=solidity)](https://soliditylang.org/)
[![WebRTC](https://img.shields.io/badge/Peer_to_Peer-WebRTC-orange?logo=webrtc)](https://webrtc.org/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-green?logo=fastapi)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 📖 Overview

A **decentralized chat application** that enables **secure, private, and peer-to-peer communication** between users — without centralized servers.

Messages are transmitted directly using **WebRTC** and verified through **Ethereum smart contracts**.  
All message **metadata** (hash, timestamp, sender, receiver) is stored **on-chain** for transparency and immutability, while actual messages are **encrypted and exchanged off-chain**.

---

## ⚙️ Technology Stack

### 🖥️ Frontend
| Tool | Purpose |
|------|----------|
| **React.js** | Builds dynamic and responsive UI |
| **Material-UI** | Provides modern UI components |
| **Simple-Peer / WebRTC** | Enables peer-to-peer connections between browsers |
| **Web3.js** | Connects frontend with Ethereum blockchain |
| **Crypto-JS** | Encrypts and decrypts chat messages |
| **Axios** | Handles REST API communication with the backend |

### ⚡ Backend
| Tool | Purpose |
|------|----------|
| **FastAPI** | Python backend framework for signaling and WebSocket communication |
| **Uvicorn** | ASGI server to run FastAPI apps |
| **WebSockets** | Enables real-time message exchange during signaling |

### ⛓️ Blockchain
| Tool | Purpose |
|------|----------|
| **Solidity** | Smart contract language for storing message metadata |
| **Truffle** | Framework to compile, deploy, and test contracts |
| **Ganache** | Local Ethereum blockchain for testing |
| **MetaMask** | Wallet for authentication and transaction signing |

---

## 🧱 Key Features

✅ **Peer-to-Peer Messaging** — Direct WebRTC communication without servers.  
✅ **End-to-End Encryption** — Only sender and receiver can read messages.  
✅ **Blockchain Metadata Storage** — Each message hash is stored on-chain for verification.  
✅ **Wallet Authentication (MetaMask)** — Secure and decentralized login.  
✅ **FastAPI Signaling Server** — Used only for initial connection setup.  
✅ **Data Immutability** — Once stored, data cannot be altered or deleted.

---

## 🧰 Tools Explained

### 🧱 **Truffle**
A framework to **compile, deploy, and test Ethereum smart contracts** easily.  
It simplifies blockchain development workflows.

### 💠 **Ganache**
A personal local blockchain for developers to **simulate Ethereum networks** and test transactions using fake ETH.

### 🦊 **MetaMask**
A **browser-based wallet** that connects users to the Ethereum network, handles account management, and signs blockchain transactions.

### 🌐 **WebRTC**
A **real-time communication protocol** that allows browsers to establish encrypted peer-to-peer data channels for direct message transfer.

### ⚡ **FastAPI**
A **Python web framework** used for the backend signaling process — exchanging WebRTC “offers,” “answers,” and “ICE candidates” between peers.

---

## 🧩 Project Architecture

decentralized-chat-app/
│
├── backend/
│ ├── app.py # FastAPI backend for WebRTC signaling
│ ├── contracts/
│ │ └── ChatMetadata.sol # Solidity smart contract for message metadata
│ ├── migrations/ # Truffle migration scripts
│ ├── truffle-config.js # Truffle configuration file
│ └── requirements.txt # Backend dependencies
│
├── frontend/
│ ├── src/
│ │ ├── pages/ # Chat.js, Home.js
│ │ ├── components/ # UI elements (buttons, modals, etc.)
│ │ ├── utils/ # webrtc.js, blockchain.js
│ │ └── App.js # Main React entry point
│ ├── public/
│ └── package.json
│
└── README.md


---

## 🛠️ Setup and Installation

### 
1️⃣ Clone the Repository
```bash
git clone https://github.com/your-username/decentralized-chat-app.git
cd decentralized-chat-app
```
2️⃣ Start Ganache (Local Blockchain)

Open Ganache GUI

Create a new workspace

Copy the RPC URL (e.g. http://127.0.0.1:7545)

3️⃣ Deploy Smart Contract
cd backend
truffle migrate --reset
After deployment, copy the generated contract address and update it in:

frontend/src/utils/blockchain.js

4️⃣ Start Backend
cd backend
uvicorn app:app --host 0.0.0.0 --port 8000

5️⃣ Start Frontend
cd frontend
npm install
npm start


Now open http://localhost:3000
 and connect your MetaMask wallet.

🔐 How It Works
🔸 Step 1: Authentication

Users connect their MetaMask wallet — the wallet address acts as their decentralized identity.

🔸 Step 2: Peer Connection (Signaling Phase)

Both peers connect to the FastAPI signaling server.

User A creates an offer and sends it to User B.

User B replies with an answer.

Both exchange ICE candidates to complete the WebRTC handshake.

Once connected, communication is peer-to-peer.

🔸 Step 3: Messaging

User A encrypts the message locally.

Message hash + metadata are stored on-chain.

The encrypted message is sent directly to User B via WebRTC.

User B decrypts it and verifies metadata from the blockchain.

🔒 Security Features
Feature	Description
End-to-End Encryption	Messages are encrypted client-side before sending.
Blockchain Verification	Message integrity verified using stored hash.
Wallet Authentication	Secure user identity via MetaMask.
Decentralized Storage	Only message metadata is stored on-chain; content stays private.
⚙️ Data Flow Summary
Message Composition → Encryption → WebRTC Transmission → 
Blockchain Metadata Storage → Decryption → Display

Stage	Description
Encryption	AES encryption using CryptoJS
WebRTC	Direct encrypted data channel
Blockchain	Stores sender, receiver, timestamp, hash
Verification	Confirms message authenticity
🧠 Key Smart Contract: ChatMetadata.sol
🔹 Struct: MessageMeta
struct MessageMeta {
    address sender;
    address receiver;
    uint256 timestamp;
    bytes32 messageHash;
}

🔹 Functions:

storeMetadata(address receiver, bytes32 messageHash)
→ Stores message metadata on-chain

getMetadata(uint256 index)
→ Retrieves metadata for verification

event MetadataStored(...)
→ Emitted when new message metadata is saved

🧩 Key Files
File	Description
Chat.js	Chat interface; handles WebRTC connections and UI
blockchain.js	Blockchain logic; interacts with Web3 and contracts
webrtc.js	WebRTC signaling and data transmission
app.py	FastAPI backend for signaling
ChatMetadata.sol	Smart contract for storing message metadata
🌍 Future Enhancements
Feature	Description
🧑‍🤝‍🧑 Group Chats	Multi-peer WebRTC rooms for multiple participants
📁 File Sharing	Encrypted file exchange or IPFS integration
🔔 Push Notifications	Notify users of new messages
🔄 Cross-Chain Support	Ethereum, Polygon, Avalanche, etc.
🔐 Advanced Security	Multi-signature wallets, biometric logins
🧱 Decentralized Storage	IPFS for storing media/files
📱 Mobile App	PWA or native mobile version
🧩 Friend System	On-chain friend registry and peer discovery
🧪 Testing
Unit Tests

Smart contract validation via Truffle test

Encryption/decryption verification

Integration Tests

End-to-end WebRTC + Blockchain message flow

Blockchain metadata verification

📦 Deployment
🧑‍💻 Local Development
# Frontend
npm start

# Backend
uvicorn app:app --reload

# Blockchain
ganache-cli

☁️ Production (Example: Render)

Deploy Backend (FastAPI) as a Web Service

Deploy Frontend (React) as a Static Site

Add environment variables:

PORT=8000
ALLOWED_ORIGINS=*
WEB3_PROVIDER_URL=<Your RPC Endpoint>

📚 Conclusion

This Decentralized Chat Application integrates:

Blockchain (Ethereum)

Peer-to-Peer Networking (WebRTC)

End-to-End Encryption

It ensures privacy, transparency, and decentralization in communication.
The project demonstrates real-world use of smart contracts, Web3 identity, and secure communication protocols.

🔑 Your Chat. Your Wallet. Your Data.

👨‍💻 Author

Pranav R H
B.Tech in Artificial Intelligence & Machine Learning
📧 [pranavrh260@gmail.com]
🌐 GitHub Profile
