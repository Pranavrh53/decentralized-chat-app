/**
 * gunDB.js
 * 
 * GunDB — Decentralized, peer-to-peer, real-time database for message storage.
 * Messages are stored across the Gun network and replicated between peers.
 * No central server is required — this is TRUE decentralized storage.
 * 
 * Architecture:
 *   - Each chat pair gets a unique node in the Gun graph
 *   - Messages are stored as child nodes with timestamps
 *   - Real-time subscriptions provide instant message delivery
 *   - Data persists across browser clears and device switches
 */

import Gun from 'gun/gun';
import 'gun/sea'; // Security, Encryption, Authentication
// NOTE: Do NOT import 'gun/lib/store' — it loads Radisk (Node.js disk adapter)
// which crashes in the browser. Gun uses localStorage automatically in browsers.

// Initialize GunDB with public relay peers for decentralization
// These are community-run Gun relay nodes that help replicate data
// NOTE: Heroku free-tier relays are DEAD. Use active community relays.
const gun = Gun({
  peers: [
    'https://gun-relay.cleverapps.io/gun',
    'https://gun-relay-peer.herokuapp.com/gun',        // backup
    'https://peer.wallie.io/gun',
  ],
  // Keep browser defaults; forcing Radisk can crash Webpack/browser runtimes.
  localStorage: true,
});

// Reference to the chat database in the Gun graph
const chatDB = gun.get('decentralized-chat-app-v1');

/**
 * Generate a consistent chat pair key for two addresses.
 * Sorted alphabetically so A→B and B→A share the same key.
 * 
 * @param {string} addr1 - First wallet address
 * @param {string} addr2 - Second wallet address
 * @returns {string} - Deterministic pair key
 */
export const getChatPairKey = (addr1, addr2) => {
  const a = addr1.toLowerCase();
  const b = addr2.toLowerCase();
  return a < b ? `${a}_${b}` : `${b}_${a}`;
};

/**
 * Store a message in GunDB (decentralized)
 * 
 * @param {string} sender - Sender wallet address
 * @param {string} receiver - Receiver wallet address 
 * @param {object} message - The message object
 * @returns {Promise<string>} - The message ID in Gun
 */
export const storeMessageInGun = (sender, receiver, message) => {
  return new Promise((resolve, reject) => {
    try {
      const pairKey = getChatPairKey(sender, receiver);
      
      // Create a unique message ID using timestamp + random suffix
      const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      
      // Normalize the message for storage
      const msgData = {
        id: msgId,
        content: message.content || message.text || '',
        sender: (message.sender || sender).toLowerCase(),
        receiver: (message.receiver || receiver).toLowerCase(),
        time: message.time instanceof Date 
          ? message.time.toISOString() 
          : (message.time || new Date().toISOString()),
        timestamp: message.timestamp || new Date().toISOString(),
        type: message.type || 'text',
        status: message.status || 'sent',
        // Optional fields
        ...(message.messageHash && { messageHash: message.messageHash }),
        ...(message.ipfsHash && { ipfsHash: message.ipfsHash }),
        ...(message.fileName && { fileName: message.fileName }),
        ...(message.fileSize && { fileSize: message.fileSize }),
        ...(message.fileType && { fileType: message.fileType }),
      };
      
      // Store in GunDB under the chat pair
      chatDB
        .get('chats')
        .get(pairKey)
        .get(msgId)
        .put(msgData, (ack) => {
          if (ack.err) {
            console.error('❌ Gun storage error:', ack.err);
            reject(new Error(ack.err));
          } else {
            console.log('📤 Message stored in GunDB:', msgId);
            resolve(msgId);
          }
        });
    } catch (error) {
      console.error('❌ Error storing message in GunDB:', error);
      reject(error);
    }
  });
};

/**
 * Load all messages from GunDB for a chat pair.
 * Returns a one-time snapshot of all messages.
 * 
 * @param {string} addr1 - First wallet address
 * @param {string} addr2 - Second wallet address
 * @returns {Promise<Array>} - Array of message objects, sorted by time
 */
export const loadMessagesFromGun = (addr1, addr2) => {
  return new Promise((resolve) => {
    const pairKey = getChatPairKey(addr1, addr2);
    const messages = [];
    const seen = new Set();
    
    // Set a timeout to resolve even if Gun hasn't finished
    const timeout = setTimeout(() => {
      console.log(`📥 GunDB load timeout: returning ${messages.length} messages`);
      finalize();
    }, 5000);
    
    // Track when we've received all data
    let debounceTimer = null;
    
    const finalize = () => {
      clearTimeout(timeout);
      if (debounceTimer) clearTimeout(debounceTimer);
      
      // Sort by time
      messages.sort((a, b) => {
        const timeA = new Date(a.time || a.timestamp || 0);
        const timeB = new Date(b.time || b.timestamp || 0);
        return timeA - timeB;
      });
      
      console.log(`📥 Loaded ${messages.length} messages from GunDB for pair ${pairKey}`);
      resolve(messages);
    };
    
    // Load messages from the chat pair node
    chatDB
      .get('chats')
      .get(pairKey)
      .map()
      .once((data, key) => {
        if (data && typeof data === 'object' && data.content && !seen.has(key)) {
          seen.add(key);
          
          // Clean Gun metadata
          const { _, ...cleanData } = data;
          messages.push({
            ...cleanData,
            id: cleanData.id || key,
            incoming: undefined, // Will be set by the consumer based on current user
          });
        }
        
        // Debounce: resolve after 500ms of no new messages
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(finalize, 500);
      });
    
    // If the node is empty, Gun won't fire callbacks, so resolve after timeout
  });
};

/**
 * Subscribe to real-time messages for a chat pair.
 * Calls the callback whenever a new message arrives.
 * 
 * @param {string} addr1 - First wallet address
 * @param {string} addr2 - Second wallet address
 * @param {Function} callback - Called with (message) on each new message
 * @returns {Function} - Unsubscribe function
 */
export const subscribeToMessages = (addr1, addr2, callback) => {
  const pairKey = getChatPairKey(addr1, addr2);
  const seenIds = new Set();
  let isActive = true;
  
  console.log(`🔔 Subscribing to GunDB messages for pair: ${pairKey}`);
  
  // Use .on() for real-time updates
  const ref = chatDB
    .get('chats')
    .get(pairKey)
    .map()
    .on((data, key) => {
      if (!isActive) return;
      if (!data || typeof data !== 'object' || !data.content) return;
      if (seenIds.has(key)) return;
      
      seenIds.add(key);
      
      // Clean Gun metadata
      const { _, ...cleanData } = data;
      
      console.log(`🔔 New message from GunDB:`, key);
      callback({
        ...cleanData,
        id: cleanData.id || key,
      });
    });
  
  // Return unsubscribe function
  return () => {
    isActive = false;
    console.log(`🔕 Unsubscribed from GunDB messages for pair: ${pairKey}`);
    // Gun doesn't have a clean unsubscribe, but setting isActive=false prevents callbacks
    chatDB.get('chats').get(pairKey).map().off();
  };
};

/**
 * Store friends list in GunDB (decentralized)
 * 
 * @param {string} walletAddress - User's wallet address
 * @param {Array} friends - Array of friend objects
 */
export const storeFriendsInGun = (walletAddress, friends) => {
  const addr = walletAddress.toLowerCase();
  
  friends.forEach((friend, index) => {
    const friendAddr = (friend.address || friend).toString().toLowerCase();
    const friendData = {
      address: friendAddr,
      name: friend.name || '',
      addedAt: friend.addedAt || new Date().toISOString(),
    };
    
    chatDB
      .get('friends')
      .get(addr)
      .get(friendAddr)
      .put(friendData);
  });
  
  console.log(`📤 Stored ${friends.length} friends in GunDB for ${addr}`);
};

/**
 * Load friends from GunDB
 * 
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<Array>} - Array of friend objects
 */
export const loadFriendsFromGun = (walletAddress) => {
  return new Promise((resolve) => {
    const addr = walletAddress.toLowerCase();
    const friends = [];
    const seen = new Set();
    
    const timeout = setTimeout(() => {
      finalize();
    }, 3000);
    
    let debounceTimer = null;
    
    const finalize = () => {
      clearTimeout(timeout);
      if (debounceTimer) clearTimeout(debounceTimer);
      console.log(`📥 Loaded ${friends.length} friends from GunDB for ${addr}`);
      resolve(friends);
    };
    
    chatDB
      .get('friends')
      .get(addr)
      .map()
      .once((data, key) => {
        if (data && typeof data === 'object' && data.address && !seen.has(key)) {
          seen.add(key);
          const { _, ...cleanData } = data;
          friends.push(cleanData);
        }
        
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(finalize, 500);
      });
  });
};

// Export the gun instance for direct use if needed
export { gun, chatDB };

export default {
  storeMessageInGun,
  loadMessagesFromGun,
  subscribeToMessages,
  storeFriendsInGun,
  loadFriendsFromGun,
  getChatPairKey,
  gun,
  chatDB,
};
