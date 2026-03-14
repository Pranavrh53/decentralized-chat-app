from fastapi import FastAPI, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Dict, Optional, List, Set, Any
import uvicorn
import logging
import json
import uuid
from datetime import datetime, timedelta
import asyncio
from contextlib import asynccontextmanager

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Add CORS middleware with enhanced settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# In-memory storage for signaling
class PeerData(BaseModel):
    offer: Optional[Dict] = None
    offer_from: Optional[str] = None  # Track who sent the offer
    call_type: Optional[str] = None   # 'audio' or 'video'
    answer: Optional[Dict] = None
    candidates: List[Dict] = Field(default_factory=list)
    last_updated: datetime = Field(default_factory=datetime.utcnow)

# Store peer data by peer ID (wallet address)
peers: Dict[str, PeerData] = {}

# Store active WebSocket connections
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        async with self.lock:
            self.active_connections[client_id] = websocket
        logger.info(f"Client {client_id} connected. Total connections: {len(self.active_connections)}")

    async def disconnect(self, client_id: str):
        # Normalize address to lowercase
        client_id = client_id.lower()
        async with self.lock:
            if client_id in self.active_connections:
                del self.active_connections[client_id]
        logger.info(f"Client {client_id} disconnected. Remaining connections: {len(self.active_connections)}")

    async def send_personal_message(self, message: str, client_id: str):
        # Normalize address to lowercase
        client_id = client_id.lower()
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_text(message)
                return True
            except Exception as e:
                logger.error(f"Error sending message to {client_id}: {e}")
                await self.disconnect(client_id)
        return False

manager = ConnectionManager()

# Clean up old peer data periodically
async def cleanup_old_peers():
    while True:
        try:
            now = datetime.utcnow()
            expired = [peer_id for peer_id, data in peers.items() 
                      if now - data.last_updated > timedelta(minutes=30)]
            
            for peer_id in expired:
                del peers[peer_id]
                logger.info(f"Cleaned up expired peer: {peer_id}")
                
        except Exception as e:
            logger.error(f"Error in cleanup task: {e}")
            
        await asyncio.sleep(60)  # Run cleanup every minute

# Start cleanup task on startup
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(cleanup_old_peers())

# Models
class SignalData(BaseModel):
    from_peer: str
    to_peer: str
    signal: Dict
    call_type: Optional[str] = None

class IceCandidate(BaseModel):
    from_peer: str
    to_peer: str
    candidate: Dict

# Helper function to get or create peer data
def get_peer_data(peer_id: str) -> PeerData:
    # Normalize address to lowercase for case-insensitive matching
    peer_id = peer_id.lower()
    if peer_id not in peers:
        peers[peer_id] = PeerData()
    return peers[peer_id]

# Root endpoint
@app.get("/")
async def root():
    return {"status": "WebRTC Signaling Server is running"}

# Handle WebRTC offer
@app.post("/offer")
async def handle_offer(signal: SignalData):
    logger.info(f"Received offer from {signal.from_peer} to {signal.to_peer} (call_type: {signal.call_type})")
    
    # Store the offer with sender info
    peer_data = get_peer_data(signal.to_peer)
    peer_data.offer = signal.signal
    peer_data.offer_from = signal.from_peer  # Store who sent it
    peer_data.call_type = signal.call_type or 'video'  # Default to video
    peer_data.last_updated = datetime.utcnow()
    
    # Try to send via WebSocket if available
    message = json.dumps({
        "type": "offer",
        "from": signal.from_peer,
        "signal": signal.signal,
        "callType": signal.call_type or 'video'
    })
    await manager.send_personal_message(message, signal.to_peer)
    
    return {"status": "Offer received"}

# Handle WebRTC answer
@app.post("/answer")
async def handle_answer(signal: SignalData):
    logger.info(f"Received answer from {signal.from_peer} to {signal.to_peer}")
    
    # Store the answer
    peer_data = get_peer_data(signal.to_peer)
    peer_data.answer = signal.signal
    peer_data.last_updated = datetime.utcnow()
    
    return {"status": "Answer received"}

# Handle ICE candidates
@app.post("/ice-candidate")
async def handle_ice_candidate(candidate: IceCandidate):
    logger.info(f"Received ICE candidate from {candidate.from_peer}")
    
    # Store the ICE candidate
    peer_data = get_peer_data(candidate.to_peer)
    peer_data.candidates.append(candidate.candidate)
    peer_data.last_updated = datetime.utcnow()
    
    return {"status": "ICE candidate received"}

# WebSocket endpoint for real-time signaling
@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    # Normalize address to lowercase
    client_id = client_id.lower()
    await manager.connect(websocket, client_id)
    try:
        while True:
            # Just keep the connection alive
            data = await websocket.receive_text()
            try:
                # Handle incoming messages if needed
                message = json.loads(data)
                logger.debug(f"Message from {client_id}: {message}")
                
                # Handle different types of messages
                if message.get("type") == "ping":
                    await manager.send_personal_message(
                        json.dumps({"type": "pong"}),
                        client_id
                    )
                
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON from {client_id}: {data}")
            except Exception as e:
                logger.error(f"Error processing message from {client_id}: {e}")
                
    except WebSocketDisconnect:
        logger.info(f"Client {client_id} disconnected")
    except Exception as e:
        logger.error(f"WebSocket error for {client_id}: {e}")
    finally:
        await manager.disconnect(client_id)

# Check for offers/answers/candidates (fallback for non-WebSocket clients)
@app.get("/check/{peer_id}")
async def check_signals(peer_id: str):
    # Normalize address to lowercase
    peer_id = peer_id.lower()
    if peer_id not in peers:
        return {"type": "no_peer"}
        
    peer_data = peers[peer_id]
    
    # Add 'from' and 'callType' fields to offer if it exists
    offer_with_from = None
    if peer_data.offer:
        offer_with_from = peer_data.offer.copy()
        offer_with_from['from'] = peer_data.offer_from
        offer_with_from['callType'] = peer_data.call_type or 'video'
    
    response = {
        "type": "check",
        "offer": offer_with_from,
        "answer": peer_data.answer,
        "has_candidates": len(peer_data.candidates) > 0,
        "candidates": peer_data.candidates.copy(),
        "timestamp": datetime.utcnow().isoformat()
    }
    
    # Clear the data after sending to avoid reprocessing
    # Clear offer ONLY ONCE - after first retrieval to prevent loops
    if peer_data.offer:
        logger.info(f"Clearing offer for {peer_id} after delivery")
        peer_data.offer = None
        peer_data.offer_from = None
        peer_data.call_type = None
    
    # Clear answer and candidates after sending
    if peer_data.answer:
        logger.info(f"Clearing answer for {peer_id} after delivery")
        peer_data.answer = None
    
    if len(peer_data.candidates) > 0:
        logger.info(f"Clearing {len(peer_data.candidates)} candidates for {peer_id}")
    peer_data.candidates.clear()
    
    return response


# =====================================================
# MESSAGE STORAGE — Decentralized message persistence
# =====================================================

# In-memory message store: chat_pair_key -> List[MessageData]
# chat_pair_key = sorted lowercase addresses joined by "_"
message_store: Dict[str, List[Dict]] = {}
message_store_lock = asyncio.Lock()

class StoreMessageRequest(BaseModel):
    sender: str
    receiver: str
    message: Dict[str, Any]

class MigrateMessagesRequest(BaseModel):
    sender: str
    receiver: str
    messages: List[Dict[str, Any]]

def get_chat_pair_key(addr1: str, addr2: str) -> str:
    """Generate a consistent key for a chat pair regardless of order."""
    a, b = addr1.lower(), addr2.lower()
    return f"{min(a, b)}_{max(a, b)}"

@app.post("/messages/store")
async def store_message(req: StoreMessageRequest):
    """Store a single message for a chat pair."""
    pair_key = get_chat_pair_key(req.sender, req.receiver)
    
    msg = req.message.copy()
    msg['_stored_at'] = datetime.utcnow().isoformat()
    msg['_id'] = f"{pair_key}_{len(message_store.get(pair_key, []))}_{datetime.utcnow().timestamp()}"
    
    async with message_store_lock:
        if pair_key not in message_store:
            message_store[pair_key] = []
        message_store[pair_key].append(msg)
    
    logger.info(f"Stored message for pair {pair_key}, total: {len(message_store[pair_key])}")
    return {"status": "stored", "message_id": msg['_id'], "total": len(message_store[pair_key])}

@app.get("/messages/{addr1}/{addr2}")
async def get_messages(addr1: str, addr2: str, limit: int = 200):
    """Retrieve messages between two addresses."""
    pair_key = get_chat_pair_key(addr1, addr2)
    
    async with message_store_lock:
        messages = message_store.get(pair_key, [])
    
    # Return the last N messages
    result = messages[-limit:] if len(messages) > limit else messages
    
    logger.info(f"Retrieved {len(result)} messages for pair {pair_key}")
    return {"messages": result, "total": len(messages)}

@app.post("/messages/migrate")
async def migrate_messages(req: MigrateMessagesRequest):
    """Bulk import messages from localStorage to server storage."""
    pair_key = get_chat_pair_key(req.sender, req.receiver)
    
    async with message_store_lock:
        if pair_key not in message_store:
            message_store[pair_key] = []
        
        existing_count = len(message_store[pair_key])
        
        # Deduplicate: don't add messages that already exist
        existing_fingerprints = set()
        for msg in message_store[pair_key]:
            content = msg.get('content', msg.get('text', ''))
            sender = msg.get('sender', '').lower()
            time_str = msg.get('time', msg.get('timestamp', ''))
            existing_fingerprints.add(f"{content}_{sender}_{time_str}")
        
        added = 0
        for msg in req.messages:
            content = msg.get('content', msg.get('text', ''))
            sender = msg.get('sender', '').lower()
            time_str = msg.get('time', msg.get('timestamp', ''))
            fingerprint = f"{content}_{sender}_{time_str}"
            
            if fingerprint not in existing_fingerprints:
                msg_copy = msg.copy()
                msg_copy['_stored_at'] = datetime.utcnow().isoformat()
                msg_copy['_migrated'] = True
                message_store[pair_key].append(msg_copy)
                existing_fingerprints.add(fingerprint)
                added += 1
    
    logger.info(f"Migrated {added} new messages for pair {pair_key} (skipped {len(req.messages) - added} duplicates)")
    return {
        "status": "migrated",
        "added": added,
        "skipped": len(req.messages) - added,
        "total": len(message_store.get(pair_key, []))
    }