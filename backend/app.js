const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const userRoutes = require('./routes/users.routes');
const configureSockets = require('./controllers/socketManager');

const app = express();
const server = http.createServer(app);

// Enable real-time traffic CORS policy matching your deployment
const io = socketio(server, {
    cors: {
        origin: "*", // Set to specific frontend URL (Vercel domain) in production for absolute security
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// Main Route Bindings
app.use('/api/users', userRoutes);

app.get('/', (req, res) => {
    res.send('MERN Zoom Clone Backend API is running!');
});

// Configure Socket Listeners
configureSockets(io);

// Server Initiation and DB Atlas Connection
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGODB_URI || "mongodb+srv://manasvipal2329_db_user:YOUR_REAL_PASSWORD_HERE@majorproject.b1bvhka.mongodb.net/zoomclone";

const startServer = async () => {
    try {
        console.log('Connecting to MongoDB Atlas...');
        await mongoose.connect(MONGO_URI);
        console.log('MongoDB successfully connected.');

        server.listen(PORT, () => {
            console.log(`Server is running beautifully on port ${PORT}`);
        });
    } catch (err) {
        console.error('Database Connection Error:', err.message);
        process.exit(1);
    }
};

startServer();