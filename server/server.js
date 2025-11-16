// server/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Enable CORS for client-server communication (Vite default: http://localhost:5173)
app.use(cors());

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

app.get('/api/status', (req, res) => {
  res.json({ status: 'Online', activeUsers: io.engine.clientsCount });
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join_call', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);
    socket.to(roomId).emit('user_connected', socket.id);
  });

  socket.on('send_caption', (data) => {
    console.log(`Caption from ${socket.id}: ${data.text}`);
    socket.to(data.roomId).emit('receive_caption', {
      text: data.text,
      user: socket.id,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('signal', (data) => {
    io.to(data.target).emit('signal', {
      signal: data.signal,
      sender: socket.id
    });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
