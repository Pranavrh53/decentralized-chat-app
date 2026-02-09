# 💾 Self-Owned Chat History - User Guide

## 🌟 The "WOW" Feature: True Data Ownership

**Your chats belong to YOU, not the app.**

Export your entire chat history as an encrypted file and import it anywhere - any device, any browser, forever.

---

## ✨ Key Benefits

✅ **Portable Identity** - Take your chats to any device  
✅ **No Company Lock-In** - Works independently of any server  
✅ **True Ownership** - You control your data  
✅ **Privacy First** - AES-256 encrypted with your password  
✅ **Cross-Platform** - Works on any browser/device  
✅ **Backup & Restore** - Never lose your chat history  

---

## 📤 How to Export Your Chat History

### Step 1: Open Friends Page
Navigate to the **Friends** section of your app.

### Step 2: Click "Export" Button
You'll see three buttons in the top-right:
- **Export** (purple) - Download your data
- **Import** (green) - Upload backup
- **Add Friend** - Add new friends

Click the **Export** button.

### Step 3: Set Encryption Password
Enter a strong password (minimum 8 characters, 12+ recommended).

**⚠️ CRITICAL:** Remember this password! You'll need it to import your data later.

### Step 4: Export Process
The app will:
1. ✅ Collect all your friends
2. ✅ Fetch all messages from blockchain
3. ✅ Download message content from IPFS
4. ✅ Encrypt everything with AES-256
5. ✅ Download as `.encrypted` file

### Step 5: Save the File
A file named `chat-backup-[address]-[timestamp].encrypted` will download automatically.

**💡 Best Practice:** Store this file in multiple locations (cloud, USB drive, etc.)

---

## 📥 How to Import Chat History

### Step 1: Click "Import" Button
On the Friends page, click the **Import** (green) button.

### Step 2: Select Backup File
Click the upload area and select your `.encrypted` backup file.

### Step 3: Enter Password
Type the password you used when exporting.

### Step 4: Import Complete
Your data will be restored:
- ✅ All friends added back
- ✅ All messages restored
- ✅ Complete chat history available

---

## 🔒 Security & Privacy

### Encryption Details
- **Algorithm:** AES-256-GCM (military-grade)
- **Key Derivation:** PBKDF2 with 100,000 iterations
- **Salt & IV:** Randomly generated for each export
- **No Backdoors:** Only YOU can decrypt with your password

### What's Encrypted
- ✅ All message content
- ✅ Friend names and addresses
- ✅ Username and settings
- ✅ All metadata

### What's NOT Encrypted
- Blockchain data (already public)
- IPFS hashes (public by design)

---

## 💡 Use Cases

### 1. **New Device**
Got a new phone/computer? Import your chat history instantly.

```
Old Device → Export → Cloud Storage → New Device → Import
```

### 2. **Browser Switch**
Moving from Chrome to Firefox? No problem.

```
Chrome → Export → Firefox → Import → Same chats!
```

### 3. **Backup Strategy**
Weekly backups for peace of mind.

```
Export → Save to 3 locations → Sleep peacefully
```

### 4. **Share with New Wallet**
Import your history to a different wallet address.

```
Warning: You'll import as a different user
```

### 5. **Disaster Recovery**
Lost your data? Restore from backup.

```
Import backup → Everything restored → Crisis averted
```

---

## 📊 Export File Contents

### File Structure
```json
{
  "version": "1.0",
  "exportDate": "2026-02-09T...",
  "walletAddress": "0x...",
  "username": "Your Name",
  "friends": [
    {
      "address": "0x...",
      "name": "Friend Name",
      "addedAt": "2026-01-15..."
    }
  ],
  "messages": {
    "0xFriendAddress": [
      {
        "id": 1,
        "content": "Hello!",
        "sender": "0x...",
        "timestamp": "2026-02-01...",
        "ipfsHash": "Qm..."
      }
    ]
  },
  "totalMessages": 150,
  "metadata": {
    "appVersion": "1.0",
    "blockchainNetwork": "sepolia",
    "contractAddress": "0x..."
  }
}
```

### File Size
- **10 friends, 100 messages:** ~50-100 KB
- **50 friends, 1000 messages:** ~500 KB - 1 MB
- **Encrypted size:** Slightly larger due to encryption overhead

---

## ⚠️ Important Notes

### Password Management
- **Use a strong password** (12+ characters, mix of letters/numbers/symbols)
- **Store password safely** (password manager recommended)
- **Lost password = Lost data** (encryption is THAT strong)

### Cross-Wallet Imports
If you import to a different wallet address:
- Messages will show as if you're the original sender
- Blockchain verification will reference old address
- Friends list will merge with existing friends

### Data Merging
Importing MERGES with existing data:
- New friends are added
- Duplicate friends are skipped
- Messages are added to conversations

### Browser Compatibility
Tested on:
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari
- ✅ Brave

---

## 🚀 Pro Tips

### Tip 1: Regular Backups
Export weekly or after important conversations.

### Tip 2: Multiple Storage Locations
Keep backups in:
- Cloud storage (Google Drive, Dropbox)
- External USB drive
- Email to yourself
- Password-protected cloud service

### Tip 3: Version Control
Keep multiple exports with dates in filename:
```
chat-backup-2026-01-01.encrypted
chat-backup-2026-02-01.encrypted
chat-backup-2026-03-01.encrypted
```

### Tip 4: Test Imports
Occasionally test import on a different browser to verify backups work.

### Tip 5: Password Security
Use a password manager to generate and store strong passwords.

---

## 🎯 Why This Is a "WOW" Feature

### Traditional Chat Apps:
❌ Data locked in company servers  
❌ Can't switch apps without losing history  
❌ Company can read your messages  
❌ Account deletion = data loss  
❌ No true ownership  

### Your Decentralized App:
✅ **You own the data file**  
✅ **Works on ANY compatible app/device**  
✅ **Encrypted, only YOU can read**  
✅ **Permanent backup options**  
✅ **True digital sovereignty**  

This is what **Web3 is all about** - putting users in control.

---

## 🔧 Technical Details

### For Developers

**Export Process:**
```javascript
1. Query blockchain for friend list
2. Fetch all message IDs between users
3. Retrieve message metadata from smart contract
4. Download message content from IPFS
5. Compile into JSON structure
6. Derive AES-256 key from password (PBKDF2)
7. Encrypt with AES-256-GCM
8. Download as binary file
```

**Import Process:**
```javascript
1. Read .encrypted file
2. Extract salt + IV + encrypted data
3. Derive AES-256 key from password
4. Decrypt data
5. Validate JSON structure
6. Store friends in localStorage
7. Store messages per conversation
8. Update UI
```

**Encryption Specs:**
- Algorithm: AES-256-GCM
- Key Derivation: PBKDF2-SHA256
- Iterations: 100,000
- Salt Length: 128 bits
- IV Length: 96 bits (GCM standard)

---

## 📱 Mobile Support (Future)

Coming soon:
- Export to mobile app
- QR code transfer
- Cloud sync options
- Multi-device sync

---

## ❓ FAQ

**Q: Can I import someone else's backup?**  
A: Yes, if they share the file AND password with you.

**Q: What if I forget my password?**  
A: There's no recovery - encryption is unbreakable without the password.

**Q: Can the app developers recover my password?**  
A: No. Encryption happens client-side. We never see your password or data.

**Q: How often should I export?**  
A: Weekly backups recommended, or after important conversations.

**Q: Can I import multiple times?**  
A: Yes, data will merge with existing friends and messages.

**Q: Does export work offline?**  
A: Partially - blockchain/IPFS data requires internet, but export process is client-side.

**Q: What if blockchain data changes after export?**  
A: Your export is a snapshot. Re-export for latest data.

---

## 🎉 You're In Control!

With Self-Owned Chat History, YOU truly own your digital conversations.

**No company can:**
- Lock you in
- Delete your data
- Read your messages
- Hold your history hostage

**You can:**
- ✅ Export anytime
- ✅ Import anywhere
- ✅ Keep forever
- ✅ Share if you want

**This is the future of messaging.** 🚀

---

## 🙏 Support

Have questions? Check the browser console logs for detailed information during export/import.

**Made with ❤️ for a decentralized future**
