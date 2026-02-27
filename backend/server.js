const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const wordPairs = require('./words');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
    }
});

const PORT = process.env.PORT || 6002;

// Serve static files from the frontend build
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Fallback to index.html for SPA routing
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Game State
const rooms = {};

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('createRoom', ({ username }) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            id: roomCode,
            players: [{ id: socket.id, username, role: null, word: null, votes: 0, isReady: false }],
            status: 'LOBBY',
            creatorId: socket.id,
            turn: 0,
            descriptions: [],
            chat: []
        };
        socket.join(roomCode);
        socket.emit('roomCreated', rooms[roomCode]);
        console.log(`Room created: ${roomCode} by ${username}`);
    });

    socket.on('joinRoom', ({ roomCode, username }) => {
        const room = rooms[roomCode];
        if (!room) {
            return socket.emit('error', 'Room not found');
        }
        if (room.status !== 'LOBBY') {
            return socket.emit('error', 'Game already started');
        }

        room.players.push({ id: socket.id, username, role: null, word: null, votes: 0, isReady: false });
        socket.join(roomCode);
        io.to(roomCode).emit('roomUpdated', room);
    });

    socket.on('startGame', (roomCode) => {
        const room = rooms[roomCode];
        if (!room || room.players.length < 4) {
            return socket.emit('error', 'Need at least 4 players');
        }

        room.status = 'ASSIGNING';

        // Randomly pick word pair
        const pair = wordPairs[Math.floor(Math.random() * wordPairs.length)];

        // Randomly assign roles
        const shuffledPlayers = [...room.players].sort(() => Math.random() - 0.5);
        const roles = [];
        const numPlayers = room.players.length;

        // Roles logic:
        // 1 Mr. White
        // 1 or 2 Spies (depending on player count)
        // Rest Civilians
        const numSpies = numPlayers >= 6 ? 2 : 1;

        let assigned = 0;
        // 1 Mr White
        roles.push({ role: 'MR_WHITE', word: pair.wordB });
        assigned++;

        // Spies
        for (let i = 0; i < numSpies; i++) {
            roles.push({ role: 'SPY', word: null, category: pair.category });
            assigned++;
        }

        // Civilians
        while (assigned < numPlayers) {
            roles.push({ role: 'CIVILIAN', word: pair.wordA });
            assigned++;
        }

        // Shuffle roles again and assign to players
        const finalRoles = roles.sort(() => Math.random() - 0.5);
        room.players.forEach((p, i) => {
            p.role = finalRoles[i].role;
            p.word = finalRoles[i].word;
            p.category = finalRoles[i].category || null;
        });

        room.status = 'PLAYING';
        room.turnIndex = Math.floor(Math.random() * room.players.length);
        room.turnOwnerId = room.players[room.turnIndex].id;

        io.to(roomCode).emit('gameStarted', room);
    });

    socket.on('submitDescription', ({ roomCode, description }) => {
        const room = rooms[roomCode];
        if (!room || room.turnOwnerId !== socket.id) return;

        const player = room.players.find(p => p.id === socket.id);
        room.descriptions.push({ username: player.username, text: description });

        io.to(roomCode).emit('descriptionUpdate', {
            descriptions: room.descriptions,
            lastSpeakerId: socket.id
        });

        // State change: wait for next player choice
        io.to(roomCode).emit('waitingForNextPlayer', socket.id);
    });

    socket.on('chooseNextPlayer', ({ roomCode, nextPlayerId }) => {
        const room = rooms[roomCode];
        if (!room || room.turnOwnerId !== socket.id) return;

        room.turnOwnerId = nextPlayerId;
        io.to(roomCode).emit('turnUpdated', room.turnOwnerId);
    });

    socket.on('startVoting', (roomCode) => {
        const room = rooms[roomCode];
        if (!room) return;
        room.status = 'VOTING';
        room.votes = {}; // playerId -> [votes]
        io.to(roomCode).emit('votingStarted', room);
    });

    socket.on('castVote', ({ roomCode, targetId }) => {
        const room = rooms[roomCode];
        if (!room || room.status !== 'VOTING') return;

        if (!room.votes[targetId]) room.votes[targetId] = 0;
        room.votes[targetId]++;

        // Simple check: if total votes == active players * numSpies
        const numSpies = room.players.filter(p => p.role === 'SPY').length;
        const totalExpectedVotes = room.players.length * numSpies;
        const totalCastVotes = Object.values(room.votes).reduce((a, b) => a + b, 0);

        if (totalCastVotes >= totalExpectedVotes) {
            // End game and calculate results
            const sorted = Object.entries(room.votes).sort((a, b) => b[1] - a[1]);
            const eliminatedIds = sorted.slice(0, numSpies).map(e => e[0]);

            const eliminatedSpies = room.players.filter(p => eliminatedIds.includes(p.id) && p.role === 'SPY');
            const spiesStillIn = room.players.filter(p => p.role === 'SPY' && !eliminatedIds.includes(p.id));

            room.status = 'RESULTS';
            room.winners = (spiesStillIn.length === 0) ? 'CIVILIANS' : 'SPIES';
            room.eliminatedIds = eliminatedIds;

            io.to(roomCode).emit('gameEnded', room);
        } else {
            io.to(roomCode).emit('voteUpdate', room.votes);
        }
    });

    socket.on('adminAction', ({ roomCode, action, targetId }) => {
        const room = rooms[roomCode];
        if (!room) return;

        if (action === 'kick') {
            room.players = room.players.filter(p => p.id !== targetId);
            io.to(roomCode).emit('roomUpdated', room);
        } else if (action === 'reset') {
            room.status = 'LOBBY';
            room.descriptions = [];
            room.votes = {};
            io.to(roomCode).emit('roomUpdated', room);
        }
    });

    socket.on('spyChat', ({ roomCode, message, username }) => {
        const room = rooms[roomCode];
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (player && player.role === 'SPY') {
            io.to(roomCode).emit('spyChatMessage', { username, message });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Handle cleanup if needed
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
