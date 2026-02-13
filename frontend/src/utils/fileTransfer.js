/**
 * P2P File Transfer Utility (100% Decentralized & Free)
 * Uses WebRTC DataChannel for direct peer-to-peer file sharing
 * No servers, no IPFS pinning costs, no blockchain storage
 */

const CHUNK_SIZE = 16384; // 16KB chunks (safe for DataChannel)

/**
 * Send a file via WebRTC DataChannel
 * @param {File} file - The file to send
 * @param {Object} peer - SimplePeer instance
 * @param {Function} onProgress - Progress callback (percent)
 */
export const sendFile = async (file, peer, onProgress) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result;
        const totalChunks = Math.ceil(arrayBuffer.byteLength / CHUNK_SIZE);
        
        // Send file metadata first
        const metadata = {
          type: 'FILE_START',
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          totalChunks: totalChunks,
          timestamp: new Date().toISOString()
        };
        
        peer.send(JSON.stringify(metadata));
        console.log(`[FileTransfer] Sending file: ${file.name} (${file.size} bytes, ${totalChunks} chunks)`);
        
        // Send file in chunks
        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, arrayBuffer.byteLength);
          const chunk = arrayBuffer.slice(start, end);
          
          // Send chunk with header
          const chunkData = {
            type: 'FILE_CHUNK',
            chunkIndex: i,
            totalChunks: totalChunks
          };
          
          peer.send(JSON.stringify(chunkData));
          peer.send(chunk);
          
          // Progress update
          const progress = Math.round(((i + 1) / totalChunks) * 100);
          if (onProgress) onProgress(progress);
          
          // Small delay to prevent overwhelming the channel
          if (i % 10 === 0) {
            await new Promise(r => setTimeout(r, 10));
          }
        }
        
        // Send completion signal
        peer.send(JSON.stringify({ type: 'FILE_END' }));
        console.log('[FileTransfer] File sent successfully');
        resolve();
        
      } catch (error) {
        console.error('[FileTransfer] Send error:', error);
        reject(error);
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsArrayBuffer(file);
  });
};

/**
 * File Receiver Class
 * Handles receiving and assembling file chunks
 */
export class FileReceiver {
  constructor(onFileReceived, onProgress) {
    this.onFileReceived = onFileReceived;
    this.onProgress = onProgress;
    this.reset();
  }
  
  reset() {
    this.receiving = false;
    this.fileName = '';
    this.fileType = '';
    this.fileSize = 0;
    this.totalChunks = 0;
    this.receivedChunks = [];
    this.metadata = null;
    this.expectingChunkData = false;
  }
  
  handleData(data) {
    // Check if it's JSON (metadata/control) or binary (chunk data)
    if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
      // Binary data - this is a file chunk
      if (this.expectingChunkData) {
        this.receivedChunks.push(data);
        this.expectingChunkData = false;
        
        const progress = Math.round((this.receivedChunks.length / this.totalChunks) * 100);
        if (this.onProgress) this.onProgress(progress);
        
        console.log(`[FileTransfer] Received chunk ${this.receivedChunks.length}/${this.totalChunks}`);
      }
      return true; // Handled
    }
    
    // Try to parse as JSON
    try {
      const message = JSON.parse(data);
      
      if (message.type === 'FILE_START') {
        console.log('[FileTransfer] Starting file receive:', message.fileName);
        this.receiving = true;
        this.fileName = message.fileName;
        this.fileType = message.fileType;
        this.fileSize = message.fileSize;
        this.totalChunks = message.totalChunks;
        this.receivedChunks = [];
        this.metadata = message;
        return true; // Handled
      }
      
      if (message.type === 'FILE_CHUNK') {
        this.expectingChunkData = true;
        return true; // Handled
      }
      
      if (message.type === 'FILE_END') {
        console.log('[FileTransfer] File receive complete, assembling...');
        this.assembleFile();
        return true; // Handled
      }
      
    } catch (e) {
      // Not a file transfer message, return false so it can be handled as text
      return false;
    }
    
    return false;
  }
  
  assembleFile() {
    try {
      // Combine all chunks
      const totalSize = this.receivedChunks.reduce((sum, chunk) => {
        return sum + (chunk.byteLength || chunk.length);
      }, 0);
      
      const completeFile = new Uint8Array(totalSize);
      let offset = 0;
      
      for (const chunk of this.receivedChunks) {
        const chunkArray = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : chunk;
        completeFile.set(chunkArray, offset);
        offset += chunkArray.length;
      }
      
      // Create blob
      const blob = new Blob([completeFile], { type: this.fileType });
      const url = URL.createObjectURL(blob);
      
      console.log(`[FileTransfer] File assembled: ${this.fileName} (${blob.size} bytes)`);
      
      if (this.onFileReceived) {
        this.onFileReceived({
          fileName: this.fileName,
          fileType: this.fileType,
          fileSize: this.fileSize,
          blob: blob,
          url: url,
          timestamp: this.metadata.timestamp
        });
      }
      
      this.reset();
      
    } catch (error) {
      console.error('[FileTransfer] Assembly error:', error);
      this.reset();
    }
  }
}

/**
 * Validate file before sending
 */
export const validateFile = (file, maxSizeMB = 50) => {
  const maxSize = maxSizeMB * 1024 * 1024;
  
  if (!file) {
    return { valid: false, error: 'No file selected' };
  }
  
  if (file.size > maxSize) {
    return { valid: false, error: `File too large. Max ${maxSizeMB}MB` };
  }
  
  if (file.size === 0) {
    return { valid: false, error: 'File is empty' };
  }
  
  return { valid: true };
};

/**
 * Get file icon based on type
 */
export const getFileIcon = (fileType) => {
  if (fileType.startsWith('image/')) return '🖼️';
  if (fileType.startsWith('video/')) return '🎬';
  if (fileType.startsWith('audio/')) return '🎵';
  if (fileType.includes('pdf')) return '📄';
  if (fileType.includes('zip') || fileType.includes('rar')) return '📦';
  if (fileType.includes('doc') || fileType.includes('docx')) return '📝';
  if (fileType.includes('xls') || fileType.includes('xlsx')) return '📊';
  return '📎';
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

export default {
  sendFile,
  FileReceiver,
  validateFile,
  getFileIcon,
  formatFileSize
};
