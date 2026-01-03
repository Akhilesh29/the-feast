require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// CORS configuration
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

// Middleware to verify JWT token
const verifyToken = (socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return next(new Error('Authentication error: No token provided'));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded; // Attach user info to socket
    next();
  } catch (error) {
    return next(new Error('Authentication error: Invalid token'));
  }
};

// Apply authentication middleware to Socket.IO
io.use(verifyToken);

// REST endpoint to generate JWT token
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username && password) {
    const token = jwt.sign(
      { 
        id: 1, 
        username: username,
        email: `${username}@example.com`
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({ 
      success: true, 
      token: token,
      user: { username, id: 1 }
    });
  } else {
    res.status(401).json({ 
      success: false, 
      message: 'Username and password required' 
    });
  }
});

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.user.username} (ID: ${socket.id})`);
  
  // Join a room
  socket.on('join-room', (room) => {
    socket.join(room);
    console.log(`${socket.user.username} joined room: ${room}`);
    socket.to(room).emit('user-joined', {
      username: socket.user.username,
      message: `${socket.user.username} joined the room`
    });
  });

  // Leave a room
  socket.on('leave-room', (room) => {
    socket.leave(room);
    console.log(`${socket.user.username} left room: ${room}`);
    socket.to(room).emit('user-left', {
      username: socket.user.username,
      message: `${socket.user.username} left the room`
    });
  });

  // Handle custom events
  socket.on('message', (data) => {
    console.log(`Message from ${socket.user.username}:`, data);
    
    // Broadcast to all clients
    io.emit('message', {
      username: socket.user.username,
      userId: socket.user.id,
      message: data.message,
      timestamp: new Date().toISOString()
    });
  });

  // Handle private messages
  socket.on('private-message', (data) => {
    const { targetUserId, message } = data;
    socket.to(`user-${targetUserId}`).emit('private-message', {
      from: socket.user.username,
      fromId: socket.user.id,
      message: message,
      timestamp: new Date().toISOString()
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.user.username} (ID: ${socket.id})`);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.IO service with JWT authentication is ready`);
  console.log(`Test login endpoint: POST http://localhost:${PORT}/api/login`);
});

