// server/server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// WebSocket server
const wss = new WebSocket.Server({ server });

// Store connections by room
const rooms = new Map();
const clients = new Map();

app.get('/api/status', (req, res) => {
  res.json({ 
    status: 'Online', 
    activeUsers: clients.size,
    activeRooms: rooms.size
  });
});

wss.on('connection', (ws) => {
  const clientId = generateId();
  clients.set(clientId, { ws, roomId: null });
  
  console.log(`✅ Client connected: ${clientId}`);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      switch(data.type) {
        case 'join':
          handleJoin(clientId, data.roomId);
          break;
          
        case 'caption':
          handleCaption(clientId, data);
          break;
          
        case 'signal':
          handleSignal(clientId, data);
          break;
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    handleDisconnect(clientId);
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error for ${clientId}:`, error);
  });
});

function handleJoin(clientId, roomId) {
  const client = clients.get(clientId);
  if (!client) return;

  // Add client to room
  client.roomId = roomId;
  
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  rooms.get(roomId).add(clientId);
  
  console.log(`📞 Client ${clientId} joined room: ${roomId}`);
  
  // Notify others in the room
  broadcastToRoom(roomId, {
    type: 'user_connected',
    userId: clientId
  }, clientId);
}

function handleCaption(clientId, data) {
  const client = clients.get(clientId);
  if (!client || !client.roomId) return;

  console.log(`💬 Caption from ${clientId}: ${data.text}`);
  
  // Broadcast caption to others in room
  broadcastToRoom(client.roomId, {
    type: 'caption',
    text: data.text,
    timestamp: data.timestamp || new Date().toISOString(),
    sender: clientId
  }, clientId);
}

function handleSignal(clientId, data) {
  const client = clients.get(clientId);
  if (!client) return;

  console.log(`📡 Signal from ${clientId}`);
  
  if (data.target === 'broadcast') {
    // Broadcast to all in room
    if (client.roomId) {
      broadcastToRoom(client.roomId, {
        type: 'signal',
        signal: data.signal,
        sender: clientId
      }, clientId);
    }
  } else {
    // Send to specific peer
    const targetClient = clients.get(data.target);
    if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
      targetClient.ws.send(JSON.stringify({
        type: 'signal',
        signal: data.signal,
        sender: clientId
      }));
    }
  }
}

function handleDisconnect(clientId) {
  const client = clients.get(clientId);
  if (!client) return;

  console.log(`❌ Client disconnected: ${clientId}`);
  
  // Remove from room
  if (client.roomId) {
    const room = rooms.get(client.roomId);
    if (room) {
      room.delete(clientId);
      
      // Notify others
      broadcastToRoom(client.roomId, {
        type: 'user_disconnected',
        userId: clientId
      });
      
      // Clean up empty rooms
      if (room.size === 0) {
        rooms.delete(client.roomId);
      }
    }
  }
  
  clients.delete(clientId);
}

function broadcastToRoom(roomId, message, excludeClientId = null) {
  const room = rooms.get(roomId);
  if (!room) return;

  const messageStr = JSON.stringify(message);
  
  room.forEach(clientId => {
    if (clientId === excludeClientId) return;
    
    const client = clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(messageStr);
    }
  });
}

function generateId() {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 SignBridge server running on port ${PORT}`);
  console.log(`📍 Local: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
});