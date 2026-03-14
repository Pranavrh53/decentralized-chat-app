/**
 * messageStore.js
 * 
 * Decentralized message storage using GunDB as the PRIMARY data layer.
 * 
 * Storage hierarchy (most reliable first):
 * 1. GunDB (decentralized P2P database) — survives browser clear, device swap, truly decentralized
 * 2. IPFS + Blockchain — immutable, on-chain proof (when MetaMask available)
 * 3. Signaling server — fast relay, but centralized (fallback only)
 * 
 * localStorage is NO LONGER used for message persistence.
 * This makes the app a true dApp.
 */

import { 
  storeMessageInGun, 
  loadMessagesFromGun, 
  subscribeToMessages,
  getChatPairKey 
} from './gunDB';

const SIGNALING_SERVER = process.env.REACT_APP_SIGNALING_SERVER || 'http://localhost:8000';

/**
 * Store a message on the signaling server (fallback/relay)
 * @param {string} sender - Sender wallet address
 * @param {string} receiver - Receiver wallet address
 * @param {object} message - The message object to store
 */
export const storeMessageOnServer = async (sender, receiver, message) => {
  try {
    const response = await fetch(`${SIGNALING_SERVER}/messages/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: sender.toLowerCase(),
        receiver: receiver.toLowerCase(),
        message: {
          ...message,
          sender: (message.sender || sender).toLowerCase(),
          time: message.time instanceof Date ? message.time.toISOString() : message.time,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    console.log('📤 Message relayed to server:', data.message_id);
    return data;
  } catch (error) {
    console.warn('⚠️ Server relay failed (non-critical, GunDB is primary):', error.message);
    return null;
  }
};

/**
 * Retrieve messages from the server for a chat pair (fallback)
 * @param {string} user1 - First user wallet address
 * @param {string} user2 - Second user wallet address
 * @param {number} limit - Max number of messages to retrieve
 * @returns {Promise<Array>} Array of message objects
 */
export const getMessagesFromServer = async (user1, user2, limit = 200) => {
  try {
    const addr1 = user1.toLowerCase();
    const addr2 = user2.toLowerCase();
    
    const response = await fetch(
      `${SIGNALING_SERVER}/messages/${addr1}/${addr2}?limit=${limit}`
    );

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    console.log(`📥 Retrieved ${data.messages?.length || 0} messages from server (fallback)`);
    return data.messages || [];
  } catch (error) {
    console.warn('⚠️ Server retrieval failed (non-critical):', error.message);
    return [];
  }
};

/**
 * Load messages from all available decentralized sources and merge them.
 * Priority: GunDB (decentralized) > Server (relay fallback)
 * 
 * localStorage is NOT used — this is what makes it a true dApp.
 * 
 * @param {string} account - Current user's wallet address
 * @param {string} receiver - Chat partner's wallet address
 * @returns {Promise<Array>} Merged, deduplicated, sorted messages
 */
export const loadMessagesFromAllSources = async (account, receiver) => {
  // Load from GunDB (primary decentralized source) and server (fallback) in parallel
  const [gunMessages, serverMessages] = await Promise.all([
    loadMessagesFromGun(account, receiver),
    getMessagesFromServer(account, receiver)
  ]);

  console.log(`📊 Sources: GunDB=${gunMessages.length}, Server=${serverMessages.length}`);

  // Merge and deduplicate — GunDB messages take priority
  const allMessages = [...gunMessages, ...serverMessages];
  const seen = new Set();
  const uniqueMessages = allMessages.filter(msg => {
    // Create a fingerprint for deduplication
    const content = msg.content || msg.text || '';
    const sender = (msg.sender || msg.from || '').toLowerCase();
    const time = msg.time || msg.timestamp || '';
    const timeMs = new Date(time).getTime();
    // Use a 2-second window for time comparison to handle slight differences
    const roundedTime = Math.floor(timeMs / 2000);
    const fingerprint = `${content}_${sender}_${roundedTime}`;
    
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });

  // Sort by time
  uniqueMessages.sort((a, b) => {
    const timeA = new Date(a.time || a.timestamp || 0);
    const timeB = new Date(b.time || b.timestamp || 0);
    return timeA - timeB;
  });

  // If server had messages that GunDB didn't, store them in GunDB for future access
  if (serverMessages.length > 0 && gunMessages.length < serverMessages.length) {
    console.log('🔄 Syncing server messages to GunDB...');
    for (const msg of serverMessages) {
      try {
        await storeMessageInGun(account, receiver, msg);
      } catch (e) {
        // Non-critical, just log
        console.warn('Sync to GunDB failed for a message:', e.message);
      }
    }
  }

  return uniqueMessages;
};

/**
 * Save a message to GunDB (primary) and server (relay backup).
 * No localStorage involved — truly decentralized.
 */
export const saveMessage = async (account, receiver, message) => {
  // Save to GunDB immediately (decentralized, persistent)
  try {
    await storeMessageInGun(account, receiver, message);
    console.log('✅ Message saved to GunDB (decentralized)');
  } catch (err) {
    console.error('❌ GunDB save failed:', err);
  }

  // Also relay to server in background (non-blocking, fallback)
  storeMessageOnServer(account, receiver, message).catch(err => {
    console.warn('Background server relay failed:', err);
  });
};

/**
 * Subscribe to real-time messages from GunDB.
 * Returns an unsubscribe function.
 * 
 * @param {string} account - Current user's wallet address
 * @param {string} receiver - Chat partner's wallet address
 * @param {Function} onNewMessage - Callback for new messages
 * @returns {Function} Unsubscribe function
 */
export { subscribeToMessages } from './gunDB';

export default {
  storeMessageOnServer,
  getMessagesFromServer,
  loadMessagesFromAllSources,
  saveMessage
};
