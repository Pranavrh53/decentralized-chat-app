// frontend/src/utils/blockchain.js

import Web3 from "web3";
import ChatMetadataABI from "../abis/ChatMetadata.json";

// Environment variables
const CONTRACT_ADDRESS = process.env.REACT_APP_CONTRACT_ADDRESS;
const NETWORK_ID = parseInt(process.env.REACT_APP_NETWORK_ID || '1337', 10);
const RPC_URL = process.env.REACT_APP_RPC_URL || 'http://127.0.0.1:8545';

if (!CONTRACT_ADDRESS) {
  console.warn('REACT_APP_CONTRACT_ADDRESS is not set in .env');
}

let web3;
let contract;
let isInitialized = false;

/**
 * Initialize web3, connect wallet, and create contract instance
 */
export const initWeb3 = async () => {
  // If already initialized, return the existing instances
  if (isInitialized && web3 && contract) {
    const accounts = await web3.eth.getAccounts();
    return { 
      web3, 
      account: accounts[0], 
      contract,
      isInitialized: true
    };
  }

  if (window.ethereum) {
    try {
      // Initialize Web3 with MetaMask provider
      web3 = new Web3(window.ethereum);

      // Request MetaMask accounts
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const account = accounts[0];

      if (!account) {
        throw new Error("No accounts found. Please connect your wallet.");
      }

      // Check if we're on the correct network
      const currentChainId = await web3.eth.getChainId();
      if (currentChainId !== NETWORK_ID) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${NETWORK_ID.toString(16)}` }],
          });
        } catch (switchError) {
          // This error code indicates that the chain has not been added to MetaMask
          if (switchError.code === 4902) {
            try {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: `0x${NETWORK_ID.toString(16)}`,
                  chainName: 'Ganache Local',
                  nativeCurrency: {
                    name: 'Ethereum',
                    symbol: 'ETH',
                    decimals: 18
                  },
                  rpcUrls: [RPC_URL]
                }],
              });
            } catch (addError) {
              console.error('Error adding Ganache network:', addError);
              throw new Error('Failed to add Ganache network to MetaMask');
            }
          } else {
            console.error('Error switching to Ganache network:', switchError);
            throw new Error('Failed to switch to Ganache network');
          }
        }
      }

      // Check if connected to the correct network
      const chainId = await web3.eth.getChainId();
      if (chainId !== NETWORK_ID) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${NETWORK_ID.toString(16)}` }],
          });
        } catch (switchError) {
          // This error code indicates that the chain has not been added to MetaMask
          if (switchError.code === 4902) {
            try {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: `0x${NETWORK_ID.toString(16)}`,
                  chainName: 'Ganache Local',
                  nativeCurrency: {
                    name: 'Ethereum',
                    symbol: 'ETH',
                    decimals: 18
                  },
                  rpcUrls: [RPC_URL]
                }],
              });
            } catch (addError) {
              console.error('Error adding Ganache network:', addError);
              throw new Error('Failed to add Ganache network to MetaMask');
            }
          } else {
            console.error('Error switching to Ganache network:', switchError);
            throw new Error('Failed to switch to Ganache network');
          }
        }
      }

      // Contract address and ABI
      if (!CONTRACT_ADDRESS) {
        throw new Error("Contract address not configured. Please set REACT_APP_CONTRACT_ADDRESS in .env");
      }

      if (!ChatMetadataABI?.abi) {
        throw new Error("ChatMetadata ABI not found!");
      }

      // Create contract instance
      contract = new web3.eth.Contract(ChatMetadataABI.abi, CONTRACT_ADDRESS);
      isInitialized = true;

      console.log("✅ Connected to contract at:", CONTRACT_ADDRESS);
      console.log("👤 Connected wallet:", account);

      return { 
        web3, 
        account, 
        contract,
        isInitialized: true
      };
    } catch (error) {
      console.error("❌ Error in initWeb3:", error);
      isInitialized = false;
      throw error; // Re-throw to be handled by the caller
    }
  } else {
    const errorMsg = "MetaMask not detected! Please install MetaMask.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
};

/**
 * Get the initialized contract instance
 * @throws {Error} If contract is not initialized
 */
export const getContract = () => {
  if (!contract || !isInitialized) {
    throw new Error("Contract not initialized. Call initWeb3() first.");
  }
  return contract;
};

/**
 * Store message metadata on-chain
 * @param {string} sender - sender wallet address
 * @param {string} receiver - receiver wallet address
 * @param {string} messageHash - hash of the message
 */
export const storeMessageMetadata = async (sender, receiver, messageHash) => {
  try {
    const web3 = getWeb3();
    const accounts = await web3.eth.getAccounts();
    const chatMetadata = new web3.eth.Contract(
      ChatMetadataABI.abi,
      process.env.REACT_APP_CONTRACT_ADDRESS
    );

    // Get current block timestamp
    const block = await web3.eth.getBlock('latest');
    const timestamp = block.timestamp;

    // Store the message hash on-chain (timestamp is set by the contract)
    await chatMetadata.methods
      .storeMetadata(receiver, messageHash)
      .send({ from: accounts[0] });

    return true;
  } catch (error) {
    console.error("❌ Error storing message metadata:", error);
    throw error;
  }
};

/**
 * Get message metadata by ID with retry mechanism
 * @param {number} id - message ID
 * @param {number} [retries=3] - number of retry attempts
 */
/**
 * Get message metadata by ID with retry mechanism
 * @param {number} id - message ID
 * @param {number} [retries=3] - number of retry attempts
 * @throws {Error} If message not found or other error occurs
 */
/**
 * Get message metadata by ID with retry mechanism
 * @param {number} id - message ID
 * @param {number} [retries=3] - number of retry attempts
 * @throws {Error} If message not found or other error occurs
 */
export const getMessageMetadata = async (messageId, maxRetries = 3) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const web3 = getWeb3();
      const chatMetadata = new web3.eth.Contract(
        ChatMetadataABI.abi,
        process.env.REACT_APP_CONTRACT_ADDRESS
      );

      // Get message data from the smart contract
      const message = await chatMetadata.methods.messages(messageId).call();

      // Check if message exists (non-zero address)
      if (message.sender === "0x0000000000000000000000000000000000000000") {
        throw new Error("Message not found");
      }

      // If no transaction hash is available, use the current block timestamp
      let timestamp = Math.floor(Date.now() / 1000); // Fallback to current time
      
      // Only try to get the block if we have a valid transaction hash
      if (message.transactionHash && message.transactionHash !== '0x') {
        try {
          const tx = await web3.eth.getTransaction(message.transactionHash);
          if (tx && tx.blockNumber) {
            const block = await web3.eth.getBlock(tx.blockNumber);
            if (block && block.timestamp) {
              timestamp = block.timestamp;
            }
          }
        } catch (txError) {
          console.warn('Failed to get transaction details, using fallback timestamp:', txError);
        }
      }
      
      return {
        sender: message.sender,
        receiver: message.receiver,
        messageHash: message.messageHash,
        timestamp: timestamp,
        transactionHash: message.transactionHash || '0x0'
      };
    } catch (error) {
      lastError = error;
      
      if (error.message.includes('revert') || 
          error.message.includes('invalid opcode') ||
          error.message.includes('not found')) {
        throw new Error('Message not found or invalid ID');
      }
      
      console.error(`❌ Error fetching message metadata (attempt ${attempt}/${maxRetries}):`, error);
      
      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        throw new Error(`Failed to fetch message after ${maxRetries} attempts: ${error.message}`);
      }
      
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
  
  // This should never be reached, but just in case
  throw lastError || new Error('Unknown error occurred while fetching message');
};

/**
 * Get the Web3 instance
 * @throws {Error} If Web3 is not initialized
 */
export const getWeb3 = () => {
  if (!web3) {
    throw new Error("Web3 not initialized. Call initWeb3() first.");
  }
  return web3;
};

/**
 * Hash a message using SHA-256
 * @param {string} message - the message to hash
 * @returns {string} - hex hash
 */
export const hashMessage = async (message) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = "0x" + hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
};
