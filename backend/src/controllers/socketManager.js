module.exports = (io) => {
    // Keep reference of current users inside each room
    const activeRooms = {}; 

    io.on('connection', (socket) => {
        console.log('Client connected through WebSockets:', socket.id);

        // Handshake on joining a call room
        socket.on('join-call', ({ roomId, username }) => {
            socket.join(roomId);
            socket.roomId = roomId;
            socket.username = username;

            if (!activeRooms[roomId]) {
                activeRooms[roomId] = [];
            }
            
            // Check if socket is already in room listing
            const alreadyInRoom = activeRooms[roomId].some(u => u.id === socket.id);
            if (!alreadyInRoom) {
                activeRooms[roomId].push({ id: socket.id, username });
            }

            console.log(`User [${username}] joined room [${roomId}]`);

            // Tell other users in the room that a peer joined
            socket.to(roomId).emit('user-connected', {
                socketId: socket.id,
                username: username
            });

            // Return current list of participants to the incoming user
            const peers = activeRooms[roomId].filter(user => user.id !== socket.id);
            socket.emit('get-all-participants', peers);
        });

        // Pass WebRTC signaling messages directly between matching peers
        socket.on('signal', ({ targetId, signalData }) => {
            io.to(targetId).emit('signal', {
                senderId: socket.id,
                signalData
            });
        });

        // Broadcast text messaging logs
        socket.on('chat-message', ({ roomId, message }) => {
            const chatPayload = {
                sender: socket.username || 'Anonymous',
                text: message,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            io.to(roomId).emit('chat-message', chatPayload);
        });

        // Manage disconnection cleanups
        socket.on('disconnect', () => {
            const roomId = socket.roomId;
            if (roomId && activeRooms[roomId]) {
                // Remove socket from record
                activeRooms[roomId] = activeRooms[roomId].filter(u => u.id !== socket.id);
                
                // Erase empty rooms
                if (activeRooms[roomId].length === 0) {
                    delete activeRooms[roomId];
                }

                // Notify survivors in the room
                socket.to(roomId).emit('user-disconnected', {
                    socketId: socket.id,
                    username: socket.username
                });
                console.log(`Client [${socket.username}] left room [${roomId}]`);
            }
        });
    });
};