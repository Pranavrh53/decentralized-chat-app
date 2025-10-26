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
    const contract = getContract();
    return await contract.methods.storeMetadata(receiver, messageHash).send({ 
      from: sender,
      gas: 300000 // Add explicit gas limit
    });
  } catch (error) {
    console.error("❌ Error storing message metadata:", error);
    throw new Error(`Failed to store message: ${error.message}`);
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
export const getMessageMetadata = async (id, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const contract = getContract();
      const metadata = await contract.methods.getMetadata(id).call();
      
      // Check if the metadata exists (not all zeros address)
      if (metadata && metadata.sender === '0x0000000000000000000000000000000000000000') {
        throw new Error('Message not found');
      }
      
      return metadata;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      const isCircuitBreakerError = error.message.includes('circuit breaker') || 
                                  (error.data && error.data.message && 
                                   error.data.message.includes('circuit breaker'));
      
      if (isCircuitBreakerError && !isLastAttempt) {
        // Wait before retrying (exponential backoff)
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s, etc.
        console.warn(`Circuit breaker open, retrying in ${delay}ms (attempt ${attempt}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      if (error.message.includes('revert') || 
          error.message.includes('invalid opcode') ||
          error.message.includes('not found')) {
        throw new Error('Message not found or invalid ID');
      }
      
      console.error(`❌ Error fetching message metadata (attempt ${attempt}):`, error);
      
      if (isLastAttempt) {
        throw new Error(`Failed to fetch message after ${retries} attempts: ${error.message}`);
      }
    }
  }
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
