import axios from 'axios';

// Pinata IPFS API endpoints
const PINATA_API_URL = 'https://api.pinata.cloud';
const PINATA_GATEWAY = 'https://gateway.pinata.cloud/ipfs';

// Alternative: Use public IPFS gateways as fallback
const PUBLIC_GATEWAYS = [
  'https://ipfs.io/ipfs',
  'https://cloudflare-ipfs.com/ipfs',
  'https://gateway.pinata.cloud/ipfs'
];

/**
 * Upload message content to IPFS via Pinata
 * @param {string} messageContent - The message text to upload
 * @param {object} metadata - Optional metadata (sender, receiver, timestamp)
 * @returns {Promise<string>} IPFS hash (CID)
 */
export const uploadToIPFS = async (messageContent, metadata = {}) => {
  try {
    const pinataApiKey = process.env.REACT_APP_PINATA_API_KEY;
    const pinataSecretKey = process.env.REACT_APP_PINATA_SECRET_KEY;

    if (!pinataApiKey || !pinataSecretKey) {
      console.warn('⚠️ Pinata credentials not found, using public IPFS upload');
      // Fallback to public IPFS gateway (limited functionality)
      return await uploadToPublicIPFS(messageContent, metadata);
    }

    // Create JSON object with message and metadata
    const jsonData = {
      content: messageContent,
      timestamp: metadata.timestamp || new Date().toISOString(),
      sender: metadata.sender || '',
      receiver: metadata.receiver || '',
      version: '1.0'
    };

    // Pin JSON to IPFS via Pinata
    const response = await axios.post(
      `${PINATA_API_URL}/pinning/pinJSONToIPFS`,
      jsonData,
      {
        headers: {
          'Content-Type': 'application/json',
          'pinata_api_key': pinataApiKey,
          'pinata_secret_api_key': pinataSecretKey
        }
      }
    );

    const ipfsHash = response.data.IpfsHash;
    console.log('✅ Message uploaded to IPFS:', ipfsHash);
    return ipfsHash;

  } catch (error) {
    console.error('❌ Error uploading to IPFS:', error);
    // Fallback: store in localStorage as backup
    return await uploadToPublicIPFS(messageContent, metadata);
  }
};

/**
 * Retrieve message content from IPFS
 * @param {string} ipfsHash - The IPFS hash (CID)
 * @returns {Promise<object>} Message object with content and metadata
 */
export const retrieveFromIPFS = async (ipfsHash) => {
  if (!ipfsHash) {
    throw new Error('IPFS hash is required');
  }

  // Try multiple gateways for redundancy
  for (const gateway of PUBLIC_GATEWAYS) {
    try {
      const url = `${gateway}/${ipfsHash}`;
      console.log(`🔄 Fetching from IPFS gateway: ${gateway}`);
      
      const response = await axios.get(url, {
        timeout: 10000, // 10 second timeout
        headers: {
          'Accept': 'application/json'
        }
      });

      console.log('✅ Successfully retrieved from IPFS:', ipfsHash);
      return response.data;

    } catch (error) {
      console.warn(`⚠️ Failed to fetch from ${gateway}:`, error.message);
      // Try next gateway
      continue;
    }
  }

  // If all gateways fail, check localStorage backup
  console.warn('⚠️ All IPFS gateways failed, checking localStorage backup');
  const backup = localStorage.getItem(`ipfs_backup_${ipfsHash}`);
  if (backup) {
    return JSON.parse(backup);
  }

  throw new Error('Failed to retrieve message from IPFS');
};

/**
 * Fallback: Upload to localStorage when IPFS is unavailable
 * Creates a deterministic "hash" for the message
 */
const uploadToPublicIPFS = async (messageContent, metadata) => {
  try {
    console.warn('⚠️ Using localStorage fallback (not true IPFS)');
    
    // Create a pseudo-hash using timestamp and content
    const data = {
      content: messageContent,
      timestamp: metadata.timestamp || new Date().toISOString(),
      sender: metadata.sender || '',
      receiver: metadata.receiver || ''
    };
    
    // Generate a simple hash-like identifier
    const pseudoHash = `local_${Date.now()}_${btoa(messageContent.substring(0, 20)).replace(/[^a-zA-Z0-9]/g, '')}`;
    
    // Store in localStorage
    localStorage.setItem(`ipfs_backup_${pseudoHash}`, JSON.stringify(data));
    
    console.log('📦 Stored in localStorage with key:', pseudoHash);
    return pseudoHash;
    
  } catch (error) {
    console.error('❌ Error in localStorage fallback:', error);
    throw error;
  }
};

/**
 * Encrypt message before uploading (simple XOR encryption for demo)
 * For production, use proper encryption like AES-256
 */
export const encryptMessage = (message, key) => {
  // Simple XOR encryption (NOT secure for production)
  let encrypted = '';
  for (let i = 0; i < message.length; i++) {
    encrypted += String.fromCharCode(
      message.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    );
  }
  return btoa(encrypted); // Base64 encode
};

/**
 * Decrypt message after retrieval
 */
export const decryptMessage = (encryptedMessage, key) => {
  try {
    const encrypted = atob(encryptedMessage); // Base64 decode
    let decrypted = '';
    for (let i = 0; i < encrypted.length; i++) {
      decrypted += String.fromCharCode(
        encrypted.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      );
    }
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return encryptedMessage; // Return as-is if decryption fails
  }
};

/**
 * Check if IPFS/Pinata is configured
 */
export const isIPFSConfigured = () => {
  return !!(process.env.REACT_APP_PINATA_API_KEY && process.env.REACT_APP_PINATA_SECRET_KEY);
};

/**
 * Upload a file (image, document, etc.) to IPFS via Pinata
 * @param {File} file - The file object to upload
 * @param {object} metadata - Optional metadata (sender, receiver, timestamp)
 * @returns {Promise<object>} Object with ipfsHash, fileName, fileType, fileSize
 */
export const uploadFileToIPFS = async (file, metadata = {}) => {
  try {
    const pinataApiKey = process.env.REACT_APP_PINATA_API_KEY;
    const pinataSecretKey = process.env.REACT_APP_PINATA_SECRET_KEY;

    if (!pinataApiKey || !pinataSecretKey) {
      console.warn('⚠️ Pinata credentials not found, cannot upload files');
      throw new Error('IPFS not configured. Please set Pinata API keys.');
    }

    // Create FormData for file upload
    const formData = new FormData();
    formData.append('file', file);

    // Add metadata
    const pinataMetadata = JSON.stringify({
      name: file.name,
      keyvalues: {
        sender: metadata.sender || '',
        receiver: metadata.receiver || '',
        timestamp: metadata.timestamp || new Date().toISOString(),
        fileType: file.type,
        fileSize: file.size.toString()
      }
    });
    formData.append('pinataMetadata', pinataMetadata);

    // Upload to Pinata
    console.log(`📤 Uploading file to IPFS: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
    
    const response = await axios.post(
      `${PINATA_API_URL}/pinning/pinFileToIPFS`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          'pinata_api_key': pinataApiKey,
          'pinata_secret_api_key': pinataSecretKey
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    const ipfsHash = response.data.IpfsHash;
    console.log('✅ File uploaded to IPFS:', ipfsHash);

    return {
      ipfsHash,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      url: `${PINATA_GATEWAY}/${ipfsHash}`
    };

  } catch (error) {
    console.error('❌ Error uploading file to IPFS:', error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
};

/**
 * Get file URL from IPFS hash
 * @param {string} ipfsHash - The IPFS CID
 * @returns {string} Public gateway URL
 */
export const getIPFSFileUrl = (ipfsHash) => {
  if (!ipfsHash) return '';
  return `${PINATA_GATEWAY}/${ipfsHash}`;
};

/**
 * Check if file is an image
 * @param {string} fileType - MIME type
 * @returns {boolean}
 */
export const isImageFile = (fileType) => {
  return fileType && fileType.startsWith('image/');
};

/**
 * Check if file size is acceptable (max 10MB for free tier)
 * @param {number} fileSize - Size in bytes
 * @returns {boolean}
 */
export const isFileSizeAcceptable = (fileSize) => {
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  return fileSize <= MAX_SIZE;
};

export default {
  uploadToIPFS,
  retrieveFromIPFS,
  encryptMessage,
  decryptMessage,
  isIPFSConfigured,
  uploadFileToIPFS,
  getIPFSFileUrl,
  isImageFile,
  isFileSizeAcceptable
};
