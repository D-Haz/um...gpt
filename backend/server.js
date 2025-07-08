const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const os = require('os');

const app = express();
const server = http.createServer(app);

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});

app.use(limiter);
app.use(cors());
app.use(express.json());

// Get network IP address
function getNetworkIP() {
    const interfaces = os.networkInterfaces();
    for (const interfaceName in interfaces) {
        const iface = interfaces[interfaceName];
        for (let i = 0; i < iface.length; i++) {
            const { address, family, internal } = iface[i];
            if (family === 'IPv4' && !internal) {
                return address;
            }
        }
    }
    return 'localhost';
}

const localIP = getNetworkIP();

// Configure Socket.IO with CORS
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: false
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// Game state management
class ChatManager {
    constructor() {
        this.waitingChatters = new Set();
        this.waitingChattees = new Set();
        this.activeChats = new Map(); // socketId -> partnerId
        this.userRoles = new Map(); // socketId -> role
        this.lastMessageTime = new Map(); // socketId -> timestamp
        this.messageThrottle = 1000; // 1 second
    }

    addWaitingUser(socketId, role) {
        this.userRoles.set(socketId, role);
        
        if (role === 'chatter') {
            this.waitingChatters.add(socketId);
        } else if (role === 'chattee') {
            this.waitingChattees.add(socketId);
        }
        
        console.log(`User ${socketId} added to waiting queue as ${role}`);
        console.log(`Waiting chatters: ${this.waitingChatters.size}, chattees: ${this.waitingChattees.size}`);
        
        // Try to match immediately
        this.tryMatch();
    }


tryMatch() {
    if (this.waitingChatters.size > 0 && this.waitingChattees.size > 0) {
        const chatterId = this.waitingChatters.values().next().value;
        const chatteeId = this.waitingChattees.values().next().value;
        
        // Remove from waiting queues
        this.waitingChatters.delete(chatterId);
        this.waitingChattees.delete(chatteeId);
        
        // Add to active chats
        this.activeChats.set(chatterId, chatteeId);
        this.activeChats.set(chatteeId, chatterId);
        
        console.log(`Matched ${chatterId} (chatter) with ${chatteeId} (chattee)`);
        
        // Notify both users
        const chatterSocket = io.sockets.sockets.get(chatterId);
        const chatteeSocket = io.sockets.sockets.get(chatteeId);
        
        if (chatterSocket && chatteeSocket) {
            chatterSocket.emit('matched', { partnerId: chatteeId });
            chatteeSocket.emit('matched', { partnerId: chatterId });
            return true;
        }
    }
    return false;
}

    removeUser(socketId) {
        const role = this.userRoles.get(socketId);
        const partnerId = this.activeChats.get(socketId);
        
        // Remove from waiting queues
        this.waitingChatters.delete(socketId);
        this.waitingChattees.delete(socketId);
        
        // Handle active chat disconnect
        if (partnerId) {
            const partnerSocket = this.getSocketById(partnerId);
            if (partnerSocket) {
                partnerSocket.emit('partner-disconnected');
            }
            
            // Remove both from active chats
            this.activeChats.delete(socketId);
            this.activeChats.delete(partnerId);
        }
        
        // Clean up user data
        this.userRoles.delete(socketId);
        this.lastMessageTime.delete(socketId);
        
        console.log(`User ${socketId} (${role}) removed from chat manager`);
    }

    handleMessage(socketId, message) {
        // Rate limiting
        const now = Date.now();
        const lastMessage = this.lastMessageTime.get(socketId) || 0;
        
        if (now - lastMessage < this.messageThrottle) {
            return false; // Rate limited
        }
        
        this.lastMessageTime.set(socketId, now);
        
        const partnerId = this.activeChats.get(socketId);
        if (partnerId) {
            const partnerSocket = this.getSocketById(partnerId);
            if (partnerSocket) {
                partnerSocket.emit('message', {
                    message: message,
                    timestamp: now
                });
                return true;
            }
        }
        return false;
    }

    handleTyping(socketId, isTyping) {
        const partnerId = this.activeChats.get(socketId);
        if (partnerId) {
            const partnerSocket = this.getSocketById(partnerId);
            if (partnerSocket) {
                if (isTyping) {
                    partnerSocket.emit('typing');
                } else {
                    partnerSocket.emit('stop-typing');
                }
            }
        }
    }

    getSocketById(socketId) {
        return io.sockets.sockets.get(socketId);
    }

    getStats() {
        return {
            waitingChatters: this.waitingChatters.size,
            waitingChattees: this.waitingChattees.size,
            activeChats: this.activeChats.size / 2, // Divide by 2 since each chat has 2 entries
            totalConnections: io.engine.clientsCount
        };
    }
}

const chatManager = new ChatManager();

// Middleware for socket authentication and validation
io.use((socket, next) => {
    // Basic validation
    if (!socket.handshake.address) {
        return next(new Error('Invalid connection'));
    }
    
    console.log(`New connection attempt from ${socket.handshake.address}`);
    next();
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`New client connected: ${socket.id} from ${socket.handshake.address}`);
    
    // Send connection acknowledgment
    socket.emit('system', {
        message: 'Connected to umGPT servers',
        timestamp: Date.now()
    });

    // Handle user joining
    socket.on('join', (data) => {
        try {
            const { role } = data;
            
            if (!role || !['chatter', 'chattee'].includes(role)) {
                socket.emit('error', { message: 'Invalid role specified' });
                return;
            }
            
            console.log(`Socket ${socket.id} joining as ${role}`);
            
            // Add to waiting queue
            chatManager.addWaitingUser(socket.id, role);
            
            // If no match found, notify user they're waiting
            if (!chatManager.activeChats.has(socket.id)) {
                socket.emit('waiting', { 
                    message: `Looking for a ${role === 'chatter' ? 'human pretending to be AI' : 'human to chat with'}...`,
                    position: role === 'chatter' ? chatManager.waitingChatters.size : chatManager.waitingChattees.size
                });
            }
            
        } catch (error) {
            console.error('Error handling join:', error);
            socket.emit('error', { message: 'Failed to join chat' });
        }
    });

    // Handle messages
    socket.on('message', (data) => {
        try {
            const { message, timestamp } = data;
            
            if (!message || typeof message !== 'string') {
                socket.emit('error', { message: 'Invalid message format' });
                return;
            }
            
            if (message.length > 1000) {
                socket.emit('error', { message: 'Message too long' });
                return;
            }
            
            if (message.trim().length === 0) {
                socket.emit('error', { message: 'Empty message' });
                return;
            }
            
            const success = chatManager.handleMessage(socket.id, message.trim());
            
            if (!success) {
                socket.emit('error', { message: 'Message could not be delivered' });
            }
            
        } catch (error) {
            console.error('Error handling message:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    // Handle typing indicators
    socket.on('typing', () => {
        chatManager.handleTyping(socket.id, true);
    });

    socket.on('stop-typing', () => {
        chatManager.handleTyping(socket.id, false);
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
        console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);
        chatManager.removeUser(socket.id);
    });

    // Handle errors
    socket.on('error', (error) => {
        console.error(`Socket error from ${socket.id}:`, error);
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    const stats = chatManager.getStats();
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        stats: stats,
        uptime: process.uptime()
    });
});

// Stats endpoint
app.get('/stats', (req, res) => {
    const stats = chatManager.getStats();
    res.json(stats);
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Express error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
    ╔════════════════════════════════════════════════════════════════╗
    ║                        umGPT Server                            ║
    ║                       1 000% aqqueret                          ║
    ╠════════════════════════════════════════════════════════════════╣
    ║ Status: Running                                                ║
    ║ Port: ${PORT.toString().padEnd(56)}                            ║
    ║ Local URL: http://localhost:${PORT.toString().padEnd(41)}      ║
    ║ Network URL: http://${localIP}:${PORT.toString().padEnd(36)}   ║
    ║                                                                ║
    ║ Endpoints:                                                     ║
    ║   GET /health - Health check                                   ║
    ║   GET /stats  - Chat statistics                                ║
    ║                                                                ║
    ║ Ready to connect                                               ║
    ╚════════════════════════════════════════════════════════════════╝
    `);
});

// Log server stats periodically
setInterval(() => {
    const stats = chatManager.getStats();
    console.log(`[${new Date().toISOString()}] Stats:`, stats);
}, 60000); // Every minute