import CryptoJS from "crypto-js";

// In a production app, generate this per-user or per-chat
const SECRET_KEY = process.env.REACT_APP_ENCRYPTION_KEY || "dchat_secret_2025";

export const encryptMessage = (message) => {
  return CryptoJS.AES.encrypt(message, SECRET_KEY).toString();
};

export const decryptMessage = (ciphertext) => {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    console.error("Decryption error:", e);
    return "[Unable to decrypt message]";
  }
};
