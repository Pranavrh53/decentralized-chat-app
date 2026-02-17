# Video/Audio Call Feature Guide

## Overview
Your decentralized chat app now supports peer-to-peer video and audio calls using WebRTC! This feature is accessible from a dedicated **Calls** section in the navbar, keeping your chat experience clean and organized.

## Features Added

### 1. Dedicated Calls Section
- Separate page accessible from navbar
- Clean interface for selecting friends to call
- No clutter in chat interface

### 2. Video Calls
- Full HD video streaming between peers
- Picture-in-picture local video view
- Large remote video display

### 3. Audio Calls
- High-quality audio streaming
- Works without video for lower bandwidth usage

### 4. Call Controls
- **Mute/Unmute**: Toggle microphone on/off during calls
- **Video Toggle**: Turn camera on/off during video calls (video calls only)
- **End Call**: Terminate the call from either end

### 5. Call Flow
- **Navigate to Calls**: Click "CALLS" in the navbar
- **Select Friend**: Choose a friend from your list
- **Initiate Call**: Click video (📹) or audio (📞) button
- **Incoming Call**: Notification appears with Accept/Decline options
- **Active Call**: Video displays with control buttons
- **End Call**: Either party can end the call anytime

## How to Use

### Accessing the Calls Section

1. **Click "CALLS" in Navbar**: The calls section is now separate from chat
2. **View Friends List**: See all your friends available for calling
3. **Select a Friend**: Click either video or audio call buttons

### Starting a Call

1. **Navigate**: Go to **CALLS** section from navbar
2. **Choose Friend**: Select who you want to call from the list
3. **Connection**: App establishes P2P connection automatically
4. **Initiate Call**: 
   - Click the **📹 button** for video call
   - Click the **📞 button** for audio call
5. **Grant Permissions**: Browser will ask for camera/microphone access - click "Allow"
6. **Wait for Response**: The peer will see an incoming call notification

### Receiving a Call

1. **Notification**: You'll see a green banner: "📞 Incoming video/audio call..."
2. **Accept or Decline**:
   - Click **Accept** to start the call
   - Click **Decline** to reject
3. **Grant Permissions**: If accepting, allow camera/microphone access

### During a Call

#### Video Layout
- **Large Display**: Remote peer's video (main area)
- **Small PiP**: Your video (bottom-right corner, video calls only)
- **Audio Calls**: Shows avatar and "Audio Call in Progress" message

#### Control Buttons (Bottom Center)
- **🎤 Mute Button**: 
  - Click to mute/unmute your microphone
  - Turns red when muted
- **📷 Video Button** (video calls only):
  - Click to turn camera on/off
  - Turns red when camera is off
- **📞 End Call Button**:
  - Red button to terminate the call
  - Both parties return to friends list

### Ending a Call

- Click the red **📞** button in call controls
- Or click "← Back to Friends" to end and return to list
- Or the peer can end it from their side
- Video elements disappear and you return to friends list

## Technical Details

### How It Works

1. **P2P Architecture**: 
   - Media streams sent directly peer-to-peer
   - No server processes your video/audio
   - Signaling server only coordinates connection setup

2. **WebRTC Technology**:
   - Uses browser's native WebRTC APIs
   - STUN/TURN servers for NAT traversal
   - Encrypted media streams (DTLS-SRTP)

3. **Call Signaling**:
   - `call-request`: Initiator sends call request
   - `call-accepted`: Peer accepts the call
   - `call-rejected`: Peer declines the call
   - `call-ended`: Either party ends the call

### Browser Permissions

**Required Permissions**:
- 🎥 **Camera**: For video calls
- 🎤 **Microphone**: For all calls

**First-Time Setup**:
- Browser will show permission popup
- Click "Allow" to grant access
- Settings are remembered for future calls

**Troubleshooting Permissions**:
- If denied, calls won't work
- Reset in browser settings: Site Settings → Permissions
- Refresh page after changing permissions

## Code Architecture

### Files Modified/Created

1. **`frontend/src/pages/Calls.js`** (NEW)
   - Dedicated page for voice/video calls
   - Lists all friends with call buttons
   - Full call interface (connect, video display, controls)
   - Auto-responder and initiator setup
   - Call state management (incoming, active, ended)
   - WebRTC peer connection handling
   - Video element refs for local/remote streams

2. **`frontend/src/components/Navbar.js`**
   - Added "CALLS" navigation link
   - Links to `/calls` route
   - Active state highlighting for calls section

3. **`frontend/src/App.js`**
   - Added import for Calls component
   - Added `/calls` route definition
   - Protected route (requires authentication)

4. **`frontend/src/components/ChatPanel.js`**
   - Removed call-related state variables
   - Removed call buttons from chat interface
   - Removed video/audio call UI elements
   - Removed call signaling handlers
   - Kept only messaging + file sharing functionality
   - Clean separation of concerns

5. **`frontend/src/utils/webrtc.js`**
   - Added `getUserMedia()` - Get camera/mic access
   - Added `stopUserMedia()` - Stop media tracks
   - Added `setAudioMuted()` - Mute/unmute microphone
   - Added `setVideoEnabled()` - Toggle video on/off
   - Updated `createPeer()` - Accept stream parameter
   - Added `onStream` callback - Handle remote streams

### Architecture Benefits

**Separation of Concerns**:
- Chat section: Pure messaging + file sharing
- Calls section: Dedicated voice/video calling
- Clean UI with focused functionality

**Code Organization**:
- Call logic isolated in Calls.js
- WebRTC utilities reusable
- No UI clutter in chat interface

**User Experience**:
- Clear navigation (Chat vs Calls)
- Easier to find calling features
- Can switch between chat and calls easily
- Friends list shows call options clearly

## Testing Guide

### Test Setup

1. **Two Browser Windows**:
   - Open app in two different browsers (Chrome + Firefox)
   - Or two Chrome windows in separate profiles
   - Or two different computers on same network

2. **Both Users Login**:
   - Connect MetaMask in both windows
   - Login with different accounts

3. **Add as Friends**:
   - Add each other as friends (from Friends page)

4. **Navigate to Calls**:
   - Both users click "CALLS" in the navbar
   - You should see your friends list

### Test Scenarios

#### Scenario 1: Video Call
1. User A navigates to **CALLS** section
2. User A clicks **📹** button next to User B
3. Connection establishes automatically
4. User B sees "Incoming video call" notification in their Calls page
5. User B clicks **Accept**
6. Both grant camera/microphone permissions
7. Both see each other's video
8. Test controls: mute, video toggle
9. User A clicks **End Call**
10. Both return to friends list

#### Scenario 2: Audio Call
1. User A goes to **CALLS** section
2. User A clicks **📞** button next to User B
3. User B sees "Incoming audio call" notification
4. User B clicks **Accept**
5. Both grant microphone permission
6. Both hear each other (no video)
7. Audio call indicator shows on screen
8. Test mute button
9. User B clicks **End Call**
10. Both return to friends list

#### Scenario 3: Call Rejection
1. User A initiates call from Calls page
2. User B clicks **Decline**
3. User A sees error "Call was rejected"
4. Both remain in calls section

#### Scenario 4: Back Button During Call
1. Start a video call
2. User A clicks "← Back to Friends"
3. Call ends automatically
4. Both return to friends list

#### Scenario 5: Switching Between Chat and Calls
1. User A chats with User B (in Chat section)
2. User A navigates to **CALLS**
3. User A can initiate call with User B
4. After call, User A can go back to **CHAT**
5. Chat messages are preserved

### Common Issues & Solutions

#### Issue: "Permission denied" error
**Solution**: 
- Browser blocked camera/microphone access
- Go to browser settings → Site Settings → Permissions
- Allow Camera and Microphone for your app's URL

#### Issue: Black video screen
**Solution**:
- Camera might be in use by another app
- Close other apps using camera
- Refresh browser and try again

#### Issue: No audio/video
**Solution**:
- Check browser permissions (granted?)
- Check device camera/microphone (working?)
- Try different browser
- Check browser console for errors

#### Issue: Call doesn't connect
**Solution**:
- Ensure P2P chat connection is established first
- Both users should see "🟢 Connected" status
- Check network/firewall settings
- Verify signaling server is running

## Bandwidth Requirements

### Video Call
- **Minimum**: 1 Mbps upload/download
- **Recommended**: 2-3 Mbps upload/download
- **Resolution**: Adapts to connection quality

### Audio Call
- **Minimum**: 100 Kbps upload/download
- **Recommended**: 200 Kbps upload/download
- **Codec**: Opus (high quality, low bandwidth)

## Privacy & Security

### Encryption
- ✅ **Media Encrypted**: All video/audio encrypted with DTLS-SRTP
- ✅ **P2P Direct**: Streams go directly between peers
- ✅ **No Recording**: Server never processes media

### Data Privacy
- 🔒 **Your camera/microphone**: Only accessible during active call
- 🔒 **Permission-based**: Requires explicit browser permission
- 🔒 **Peer-to-peer**: No intermediary processes your streams

## Future Enhancements

Potential improvements:
1. **Group Video Calls**: Multi-party video conferencing
2. **Screen Sharing**: Share your screen during calls
3. **Call Recording**: Save calls to IPFS
4. **Virtual Backgrounds**: Blur or replace background
5. **Call History**: Track call duration and participants
6. **Quality Settings**: Adjust resolution/bandwidth
7. **Picture-in-Picture**: Minimize call to small window

## Browser Compatibility

| Browser | Video | Audio | Notes |
|---------|-------|-------|-------|
| Chrome  | ✅    | ✅    | Full support |
| Firefox | ✅    | ✅    | Full support |
| Safari  | ⚠️    | ✅    | Some iOS restrictions |
| Edge    | ✅    | ✅    | Full support |
| Opera   | ✅    | ✅    | Full support |

## Conclusion

Your decentralized chat app now has a complete communication suite:
- ✅ Text messaging (P2P encrypted)
- ✅ File/image sharing (IPFS storage)
- ✅ Voice calls (WebRTC audio)
- ✅ Video calls (WebRTC video)

All features are decentralized, secure, and work peer-to-peer without centralized servers processing your data!

---

**Need Help?** Check browser console (F12) for detailed logs and error messages.
