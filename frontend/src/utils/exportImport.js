/**
 * Chat History Export/Import Module
 * Enables users to export their complete chat data and import it on any device
 * 
 * Features:
 * - Export all friends and messages
 * - AES-256 encryption with password
 * - Cross-device/browser compatibility
 * - Portable Web3 identity
 */

import { loadChatHistory, getMessagesBetweenUsers } from './blockchain';
import { retrieveFromIPFS } from './ipfs';

// AES-GCM encryption using Web Crypto API
const ENCRYPTION_ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 16;
const ITERATIONS = 100000; // PBKDF2 iterations

/**
 * Derive encryption key from password using PBKDF2
 */
async function deriveKey(password, salt) {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: ITERATIONS,
      hash: 'SHA-256'
    },
    passwordKey,
    { name: ENCRYPTION_ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data with password
 */
async function encryptData(data, password) {
  try {
    // Generate random salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Derive encryption key
    const key = await deriveKey(password, salt);

    // Encrypt data
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(JSON.stringify(data));
    
    const encryptedData = await crypto.subtle.encrypt(
      {
        name: ENCRYPTION_ALGORITHM,
        iv: iv
      },
      key,
      dataBuffer
    );

    // Combine salt + iv + encrypted data
    const result = new Uint8Array(salt.length + iv.length + encryptedData.byteLength);
    result.set(salt, 0);
    result.set(iv, salt.length);
    result.set(new Uint8Array(encryptedData), salt.length + iv.length);

    // Convert to base64 for JSON storage
    return btoa(String.fromCharCode(...result));
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt data with password
 */
async function decryptData(encryptedBase64, password) {
  try {
    // Convert from base64
    const encryptedArray = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));

    // Extract salt, iv, and encrypted data
    const salt = encryptedArray.slice(0, SALT_LENGTH);
    const iv = encryptedArray.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const data = encryptedArray.slice(SALT_LENGTH + IV_LENGTH);

    // Derive encryption key
    const key = await deriveKey(password, salt);

    // Decrypt data
    const decryptedData = await crypto.subtle.decrypt(
      {
        name: ENCRYPTION_ALGORITHM,
        iv: iv
      },
      key,
      data
    );

    // Convert back to string and parse JSON
    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decryptedData));
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data - wrong password or corrupted file');
  }
}

/**
 * Export complete chat history for a wallet
 * @param {string} walletAddress - User's wallet address
 * @param {string} password - Encryption password
 * @param {Function} progressCallback - Optional progress callback (current, total, message)
 * @returns {Promise<string>} Encrypted export data
 */
export async function exportChatHistory(walletAddress, password, progressCallback) {
  try {
    console.log('📦 Starting chat history export...');
    
    if (!walletAddress) {
      throw new Error('Wallet address is required');
    }

    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    // Step 1: Get friends list
    progressCallback?.(1, 5, 'Loading friends list...');
    const friendsKey = `friends_${walletAddress}`;
    const friends = JSON.parse(localStorage.getItem(friendsKey) || '[]');
    console.log(`📋 Found ${friends.length} friends`);

    // Step 2: Get all messages with all friends
    progressCallback?.(2, 5, `Loading messages from ${friends.length} conversations...`);
    const allMessages = {};
    let totalMessages = 0;

    for (let i = 0; i < friends.length; i++) {
      const friend = friends[i];
      const friendAddress = typeof friend === 'string' ? friend : friend.address;
      
      if (!friendAddress) continue;

      console.log(`📥 Loading messages with ${friendAddress}...`);
      
      try {
        // Get message IDs from blockchain
        const messageIds = await getMessagesBetweenUsers(walletAddress, friendAddress);
        
        // Get full message data from blockchain + IPFS
        const messages = await loadChatHistory(walletAddress, friendAddress);
        
        // Also fetch actual message content from IPFS
        const messagesWithContent = await Promise.all(
          messages.map(async (msg) => {
            try {
              if (msg.ipfsHash) {
                const ipfsData = await retrieveFromIPFS(msg.ipfsHash);
                return {
                  ...msg,
                  content: ipfsData.content,
                  fullData: ipfsData
                };
              }
              return msg;
            } catch (error) {
              console.warn(`Failed to load IPFS content for message ${msg.id}:`, error);
              return msg;
            }
          })
        );

        allMessages[friendAddress] = messagesWithContent;
        totalMessages += messagesWithContent.length;
        
        console.log(`✅ Loaded ${messagesWithContent.length} messages with ${friendAddress}`);
      } catch (error) {
        console.warn(`Failed to load messages with ${friendAddress}:`, error);
        allMessages[friendAddress] = [];
      }
    }

    // Step 3: Prepare export data
    progressCallback?.(3, 5, 'Preparing export data...');
    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      walletAddress: walletAddress,
      username: localStorage.getItem('username') || 'Anonymous',
      friends: friends,
      messages: allMessages,
      totalMessages: totalMessages,
      metadata: {
        appVersion: '1.0',
        blockchainNetwork: 'sepolia',
        contractAddress: process.env.REACT_APP_CONTRACT_ADDRESS
      }
    };

    console.log(`📊 Export summary:`, {
      friends: friends.length,
      conversations: Object.keys(allMessages).length,
      totalMessages: totalMessages
    });

    // Step 4: Encrypt data
    progressCallback?.(4, 5, 'Encrypting data...');
    const encrypted = await encryptData(exportData, password);

    // Step 5: Complete
    progressCallback?.(5, 5, 'Export complete!');
    console.log('✅ Chat history exported successfully');

    return encrypted;
  } catch (error) {
    console.error('❌ Export failed:', error);
    throw error;
  }
}

/**
 * Import chat history from encrypted file
 * @param {string} encryptedData - Encrypted export data
 * @param {string} password - Decryption password
 * @param {string} currentWalletAddress - Current wallet address (for verification)
 * @returns {Promise<object>} Imported data summary
 */
export async function importChatHistory(encryptedData, password, currentWalletAddress) {
  try {
    console.log('📥 Starting chat history import...');

    // Step 1: Decrypt data
    console.log('🔓 Decrypting data...');
    const data = await decryptData(encryptedData, password);

    // Step 2: Validate data structure
    if (!data.version || !data.walletAddress || !data.friends || !data.messages) {
      throw new Error('Invalid export file format');
    }

    console.log('✅ Import file validated');
    console.log(`📊 Import contains:`, {
      exportedBy: data.walletAddress,
      username: data.username,
      friends: data.friends.length,
      totalMessages: data.totalMessages,
      exportDate: data.exportDate
    });

    // Step 3: Warn if importing to different wallet
    if (currentWalletAddress && 
        data.walletAddress.toLowerCase() !== currentWalletAddress.toLowerCase()) {
      console.warn('⚠️ Warning: Importing data from different wallet', {
        exportedFrom: data.walletAddress,
        importingTo: currentWalletAddress
      });
    }

    // Step 4: Store friends in localStorage
    const normalizedCurrentAddress = (currentWalletAddress || data.walletAddress).toLowerCase();
    const exporterAddress = data.walletAddress.toLowerCase();
    const friendsKey = `friends_${normalizedCurrentAddress}`;
    
    // Normalize friend addresses and handle importing someone else's data
    const normalizedFriends = data.friends
      .map(f => ({
        ...f,
        address: f.address.toLowerCase()
      }))
      .filter(f => {
        // If importing your own data, keep all friends
        if (!currentWalletAddress || normalizedCurrentAddress === exporterAddress) {
          return true;
        }
        
        // If importing someone else's data, exclude yourself from their friends list
        // (you don't want to add yourself as a friend)
        if (f.address === normalizedCurrentAddress) {
          console.log(`⏭️  Skipping self from imported friends: ${f.address}`);
          return false;
        }
        
        return true;
      });
    
    // If importing someone else's data, add THEM as a friend (if not already present)
    if (currentWalletAddress && normalizedCurrentAddress !== exporterAddress) {
      const hasExporter = normalizedFriends.some(f => f.address === exporterAddress);
      if (!hasExporter) {
        normalizedFriends.push({
          address: exporterAddress,
          name: data.username || 'Imported Friend',
          addedAt: new Date().toISOString()
        });
        console.log(`➕ Added exporter as friend: ${exporterAddress} (${data.username})`);
      }
    }
    
    // Merge with existing localStorage friends
    const existingFriends = JSON.parse(localStorage.getItem(friendsKey) || '[]');
    const mergedFriendsMap = new Map();
    
    // Add existing friends
    existingFriends.forEach(f => {
      mergedFriendsMap.set(f.address.toLowerCase(), f);
    });
    
    // Add/update imported friends
    normalizedFriends.forEach(f => {
      mergedFriendsMap.set(f.address, f);
    });
    
    const finalFriends = Array.from(mergedFriendsMap.values());
    localStorage.setItem(friendsKey, JSON.stringify(finalFriends));
    console.log(`✅ Imported ${normalizedFriends.length} friends, total: ${finalFriends.length}`);

    // Step 5: Store messages in localStorage for each conversation
    let importedMessageCount = 0;
    // Reuse exporterAddress and normalizedCurrentAddress from Step 4 above
    
    for (const [friendAddress, messages] of Object.entries(data.messages)) {
      // Normalize friend address (case-insensitive)
      let normalizedFriendAddress = friendAddress.toLowerCase();
      
      // IMPORTANT: If importing someone else's data and the friend address is YOUR address,
      // then the conversation should be with the EXPORTER, not yourself
      // Example: User A exports messages to User B. User B imports it.
      // In User A's export, the friend is User B. But User B wants to see it as a chat with User A.
      if (currentWalletAddress && normalizedFriendAddress === normalizedCurrentAddress && normalizedCurrentAddress !== exporterAddress) {
        console.log(`🔄 Flipping conversation: ${normalizedFriendAddress} → ${exporterAddress} (importing someone else's data)`);
        normalizedFriendAddress = exporterAddress;
      }
      
      // Normalize message structure to match what Chat.js expects
      const normalizedMessages = messages.map(msg => {
        // Ensure consistent structure
        const time = msg.time || msg.timestamp || new Date().toISOString();
        const content = msg.content || msg.text || '';
        
        // Determine if message is incoming based on current user
        let isIncoming;
        const msgSender = msg.sender ? msg.sender.toLowerCase() : '';
        
        if (currentWalletAddress) {
          // If importing as a different user, flip the perspective
          isIncoming = msgSender !== normalizedCurrentAddress;
        } else {
          // If importing as the same user, keep original perspective
          isIncoming = msg.incoming !== undefined ? msg.incoming : (msgSender !== exporterAddress);
        }
        
        return {
          id: msg.id || Date.now() + Math.random(),
          content: content,
          text: content,
          sender: msgSender,
          receiver: msg.receiver ? msg.receiver.toLowerCase() : '',
          time: time,
          timestamp: typeof time === 'string' ? time : time.toISOString(),
          incoming: isIncoming,
          status: msg.status || 'delivered',
          messageHash: msg.messageHash,
          ipfsHash: msg.ipfsHash
        };
      });
      
      // Store with normalized addresses (lowercase)
      const chatKey = `chat_${normalizedCurrentAddress}_${normalizedFriendAddress}`;
      localStorage.setItem(chatKey, JSON.stringify(normalizedMessages));
      importedMessageCount += normalizedMessages.length;
      
      console.log(`💾 Stored ${normalizedMessages.length} messages for ${normalizedFriendAddress} with key: ${chatKey}`);
    }
    console.log(`✅ Imported ${importedMessageCount} messages across ${Object.keys(data.messages).length} conversations`);

    // Step 6: Store metadata
    if (data.username) {
      localStorage.setItem('username', data.username);
    }

    return {
      success: true,
      walletAddress: data.walletAddress,
      username: data.username,
      friendsCount: data.friends.length,
      messagesCount: importedMessageCount,
      conversationsCount: Object.keys(data.messages).length,
      exportDate: data.exportDate
    };
  } catch (error) {
    console.error('❌ Import failed:', error);
    throw error;
  }
}

/**
 * Download encrypted data as file
 */
export function downloadExportFile(encryptedData, walletAddress) {
  const filename = `chat-backup-${walletAddress.substring(0, 8)}-${Date.now()}.encrypted`;
  
  const blob = new Blob([encryptedData], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  
  URL.revokeObjectURL(url);
  
  console.log(`💾 Downloaded: ${filename}`);
  return filename;
}

/**
 * Read import file
 */
export function readImportFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      resolve(e.target.result);
    };
    
    reader.onerror = (e) => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
}

/**
 * Validate password strength
 */
export function validatePassword(password) {
  if (!password) {
    return { valid: false, message: 'Password is required' };
  }
  
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters' };
  }
  
  if (password.length < 12) {
    return { valid: true, message: 'Password is acceptable (12+ characters recommended)' };
  }
  
  return { valid: true, message: 'Strong password' };
}

export default {
  exportChatHistory,
  importChatHistory,
  downloadExportFile,
  readImportFile,
  validatePassword
};
