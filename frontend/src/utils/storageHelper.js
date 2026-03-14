/**
 * storageHelper.js
 * 
 * Fixes the duplicate localStorage key problem caused by Ethereum address casing.
 * Checksummed addresses (mixed case) vs lowercase addresses create different keys.
 * 
 * This module:
 * 1. Normalizes ALL localStorage keys to lowercase
 * 2. Merges duplicate entries (e.g. chat_0x3BA2ff... + chat_0x3ba2ff...)
 * 3. Ensures consistent key access going forward
 */

/**
 * Normalize a localStorage key by lowercasing any Ethereum addresses found in it.
 * Ethereum addresses are 0x followed by 40 hex chars.
 */
const normalizeKey = (key) => {
  // Replace all Ethereum addresses in the key with lowercase versions
  return key.replace(/0x[a-fA-F0-9]{40}/g, (match) => match.toLowerCase());
};

/**
 * Migrate all localStorage keys to use lowercase Ethereum addresses.
 * Merges duplicate entries that only differ by address casing.
 * 
 * This should be called ONCE on app startup.
 */
export const migrateLocalStorageKeys = () => {
  console.log('🔄 Running localStorage key migration...');
  
  const keysToProcess = [];
  const keyGroups = {}; // normalizedKey -> [originalKey1, originalKey2, ...]
  
  // Step 1: Group keys by their normalized version
  for (let i = 0; i < localStorage.length; i++) {
    const originalKey = localStorage.key(i);
    if (!originalKey) continue;
    
    const normalizedKey = normalizeKey(originalKey);
    
    if (!keyGroups[normalizedKey]) {
      keyGroups[normalizedKey] = [];
    }
    keyGroups[normalizedKey].push(originalKey);
  }
  
  let migratedCount = 0;
  let mergedCount = 0;
  
  // Step 2: For each group, merge values and store under the normalized key
  for (const [normalizedKey, originalKeys] of Object.entries(keyGroups)) {
    // Skip if the key doesn't contain an Ethereum address
    if (!normalizedKey.match(/0x[a-f0-9]{40}/)) continue;
    
    // If only one key and it's already normalized, skip
    if (originalKeys.length === 1 && originalKeys[0] === normalizedKey) continue;
    
    // Need to merge or rename
    if (originalKeys.length > 1) {
      // Multiple keys exist for the same normalized key — merge!
      console.log(`🔀 Merging ${originalKeys.length} duplicate keys into: ${normalizedKey}`);
      
      const isChatKey = normalizedKey.startsWith('chat_');
      const isFriendsKey = normalizedKey.startsWith('friends_');
      
      if (isChatKey) {
        // Merge chat messages — deduplicate by content+time
        const allMessages = [];
        
        for (const key of originalKeys) {
          try {
            const messages = JSON.parse(localStorage.getItem(key) || '[]');
            allMessages.push(...messages);
          } catch (e) {
            console.warn(`Failed to parse ${key}:`, e);
          }
        }
        
        // Deduplicate messages
        const seen = new Set();
        const uniqueMessages = allMessages.filter(msg => {
          const fingerprint = `${(msg.content || msg.text || '')}_${msg.time || msg.timestamp || ''}_${(msg.sender || '').toLowerCase()}`;
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
        
        localStorage.setItem(normalizedKey, JSON.stringify(uniqueMessages));
        console.log(`  ✅ Merged ${allMessages.length} → ${uniqueMessages.length} unique messages`);
        mergedCount++;
        
      } else if (isFriendsKey) {
        // Merge friends lists — deduplicate by address
        const allFriends = [];
        
        for (const key of originalKeys) {
          try {
            const friends = JSON.parse(localStorage.getItem(key) || '[]');
            allFriends.push(...friends);
          } catch (e) {
            console.warn(`Failed to parse ${key}:`, e);
          }
        }
        
        // Deduplicate friends by address
        const friendsMap = new Map();
        allFriends.forEach(friend => {
          const addr = (friend.address || friend).toString().toLowerCase();
          if (!friendsMap.has(addr)) {
            friendsMap.set(addr, typeof friend === 'string' ? { address: addr } : { ...friend, address: addr });
          }
        });
        
        const uniqueFriends = Array.from(friendsMap.values());
        localStorage.setItem(normalizedKey, JSON.stringify(uniqueFriends));
        console.log(`  ✅ Merged ${allFriends.length} → ${uniqueFriends.length} unique friends`);
        mergedCount++;
        
      } else {
        // For other keys, just use the most recent value
        const value = localStorage.getItem(originalKeys[0]);
        localStorage.setItem(normalizedKey, value);
      }
      
      // Remove old keys (don't remove the normalized one if it already existed)
      for (const key of originalKeys) {
        if (key !== normalizedKey) {
          localStorage.removeItem(key);
          migratedCount++;
        }
      }
      
    } else {
      // Single key, just needs renaming to lowercase
      const oldKey = originalKeys[0];
      const value = localStorage.getItem(oldKey);
      localStorage.removeItem(oldKey);
      localStorage.setItem(normalizedKey, value);
      migratedCount++;
    }
  }
  
  if (migratedCount > 0 || mergedCount > 0) {
    console.log(`✅ Migration complete: ${migratedCount} keys renamed, ${mergedCount} groups merged`);
  } else {
    console.log('✅ No migration needed — all keys are already normalized');
  }
};

/**
 * Get a normalized chat key for two addresses
 */
export const getChatKey = (account, receiver) => {
  return `chat_${account.toLowerCase()}_${receiver.toLowerCase()}`;
};

/**
 * Get a normalized friends key for an address
 */
export const getFriendsKey = (walletAddress) => {
  return `friends_${walletAddress.toLowerCase()}`;
};

/**
 * Safe localStorage getter with key normalization
 */
export const getStorageItem = (key) => {
  const normalizedKey = normalizeKey(key);
  return localStorage.getItem(normalizedKey);
};

/**
 * Safe localStorage setter with key normalization
 */
export const setStorageItem = (key, value) => {
  const normalizedKey = normalizeKey(key);
  localStorage.setItem(normalizedKey, value);
};

export default {
  migrateLocalStorageKeys,
  getChatKey,
  getFriendsKey,
  getStorageItem,
  setStorageItem,
  normalizeKey
};
