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
        async with self.lock:
            if client_id in self.active_connections:
                del self.active_connections[client_id]
        logger.info(f"Client {client_id} disconnected. Remaining connections: {len(self.active_connections)}")

    async def send_personal_message(self, message: str, client_id: str):
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

class IceCandidate(BaseModel):
    from_peer: str
    to_peer: str
    candidate: Dict

# Helper function to get or create peer data
def get_peer_data(peer_id: str) -> PeerData:
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
    logger.info(f"Received offer from {signal.from_peer} to {signal.to_peer}")
    
    # Store the offer
    peer_data = get_peer_data(signal.to_peer)
    peer_data.offer = signal.signal
    peer_data.last_updated = datetime.utcnow()
    
    # Try to send via WebSocket if available
    message = json.dumps({
        "type": "offer",
        "from": signal.from_peer,
        "signal": signal.signal
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
    if peer_id not in peers:
        return {"type": "no_peer"}
        
    peer_data = peers[peer_id]
    response = {
        "type": "check",
        "offer": peer_data.offer,
        "answer": peer_data.answer,
        "has_candidates": len(peer_data.candidates) > 0,
        "candidates": peer_data.candidates.copy(),
        "timestamp": datetime.utcnow().isoformat()
    }
    
    # Clear the data after sending (except for the offer)
    peer_data.answer = None
    peer_data.candidates.clear()
    
    return response