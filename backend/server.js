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
// Using app.use() without a path avoids path-to-regexp and is compatible with all versions
app.use((req, res) => {
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
        const trimmedUsername = username?.trim();
        if (!trimmedUsername) return socket.emit('error', 'Username required');
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            id: roomCode,
            players: [{ id: socket.id, username: trimmedUsername, role: null, word: null, votes: 0, isReady: false }],
            status: 'LOBBY',
            creatorId: socket.id,
            turn: 0,
            descriptions: [],
            chat: [],
            settings: {
                numSpies: 1,
                numMrWhite: 1
            }
        };
        socket.join(roomCode);
        socket.emit('roomCreated', rooms[roomCode]);
        console.log(`Room created: ${roomCode} by ${username}`);
    });

    socket.on('joinRoom', ({ roomCode, username }) => {
        const trimmedRoomCode = roomCode?.trim().toUpperCase();
        const trimmedUsername = username?.trim();
        const room = rooms[trimmedRoomCode];
        if (!room) {
            return socket.emit('error', 'Room not found');
        }
        const existingPlayer = room.players.find(p => p.username === trimmedUsername);

        if (room.status !== 'LOBBY' && !existingPlayer) {
            return socket.emit('error', 'La partida ya ha comenzado');
        }

        if (room.players.length >= 15) {
            return socket.emit('error', 'La sala está llena (máximo 15 agentes)');
        }

        const newPlayer = { id: socket.id, username: trimmedUsername, role: null, word: null, votes: 0, isReady: false };

        // Handle rejoin: if player with same name already exists
        const existingPlayerIndex = room.players.findIndex(p => p.username === trimmedUsername);
        if (existingPlayerIndex !== -1) {
            const oldId = room.players[existingPlayerIndex].id;
            // Update ID in player list
            room.players[existingPlayerIndex].id = socket.id;

            // Map game state IDs to new socket ID
            if (room.turnOwnerId === oldId) room.turnOwnerId = socket.id;
            if (room.creatorId === oldId) room.creatorId = socket.id;

            console.log(`User ${trimmedUsername} RE-joined room ${trimmedRoomCode} (ID: ${oldId} -> ${socket.id})`);
        } else {
            room.players.push(newPlayer);
            console.log(`User ${trimmedUsername} joined room ${trimmedRoomCode}`);
        }

        socket.join(trimmedRoomCode);
        socket.emit('joinSuccess', room);
        io.to(trimmedRoomCode).emit('roomUpdated', room);
    });

    socket.on('startGame', (roomCode) => {
        const room = rooms[roomCode];
        if (!room) return;

        console.log(`Starting game for room ${roomCode}. Players: ${room.players.length}`);
        if (room.players.length < 2) {
            return socket.emit('error', 'Se necesitan al menos 2 jugadores');
        }

        room.status = 'ASSIGNING';

        // Pick word pair
        const pair = wordPairs[Math.floor(Math.random() * wordPairs.length)];
        const numPlayers = room.players.length;

        // Role Distribution: ~25% Spies, ~10% Mr White (min 1), rest Civilians
        const numSpies = Math.max(1, Math.round(numPlayers * 0.25));
        const numMrWhite = Math.max(1, Math.floor(numPlayers * 0.10));

        console.log(`[DEBUG] Distribution for ${numPlayers} players: Spies=${numSpies}, MrWhite=${numMrWhite}`);

        const rolesPool = [];
        // 1. Mr Whites (Infiltrados - Tienen la Palabra B)
        for (let i = 0; i < numMrWhite; i++) {
            rolesPool.push({ role: 'MR_WHITE', word: pair.wordB, category: pair.category });
        }
        // 2. Spies (Espías - Solo conocen la categoría)
        for (let i = 0; i < numSpies; i++) {
            rolesPool.push({ role: 'SPY', word: null, category: pair.category });
        }
        // 3. Civilians (Civiles - Tienen la Palabra A)
        while (rolesPool.length < numPlayers) {
            rolesPool.push({ role: 'CIVILIAN', word: pair.wordA, category: pair.category });
        }

        // Fisher-Yates Shuffle
        for (let i = rolesPool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rolesPool[i], rolesPool[j]] = [rolesPool[j], rolesPool[i]];
        }

        // Assign to players
        room.players.forEach((p, i) => {
            const assignment = rolesPool[i];
            p.role = assignment.role;
            p.word = assignment.word;
            p.category = assignment.category; // Now explicitly set for everyone
            p.votes = 0;
            p.isReady = false;
        });

        room.status = 'PLAYING';
        room.turnIndex = Math.floor(Math.random() * room.players.length);
        room.turnOwnerId = room.players[room.turnIndex].id;
        room.descriptions = [];

        console.log(`Game started in room ${roomCode}. Turn for ${room.players[room.turnIndex].username}`);
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

    socket.on('updateSettings', ({ roomCode, settings }) => {
        const room = rooms[roomCode];
        if (!room || room.creatorId !== socket.id) return;

        room.settings = { ...room.settings, ...settings };
        io.to(roomCode).emit('roomUpdated', room);
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

    socket.on('playAgain', (roomCode) => {
        const room = rooms[roomCode?.toUpperCase()];
        if (!room) return;

        // Reset room state
        room.status = 'LOBBY';
        room.descriptions = [];
        room.votes = {};
        room.winners = null;
        room.eliminatedIds = [];
        room.turnIndex = 0;
        room.turnOwnerId = null;

        // Reset player states
        room.players.forEach(p => {
            p.role = null;
            p.word = null;
            p.category = null;
            p.votes = 0;
            p.isReady = false;
        });

        console.log(`Room ${roomCode} reset for a new game.`);
        io.to(roomCode.toUpperCase()).emit('roomUpdated', room);
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

        // Find room where player was
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);

            if (playerIndex !== -1) {
                const player = room.players[playerIndex];
                console.log(`Removing ${player.username} from room ${roomCode}`);

                room.players.splice(playerIndex, 1);

                if (room.players.length === 0) {
                    console.log(`Deleting empty room: ${roomCode}`);
                    delete rooms[roomCode];
                } else {
                    // If creator left, assign new creator
                    if (room.creatorId === socket.id) {
                        room.creatorId = room.players[0].id;
                        console.log(`New creator for room ${roomCode}: ${room.players[0].username}`);
                    }
                    io.to(roomCode).emit('roomUpdated', room);
                }
                break;
            }
        }
    });
});

const PUBLIC_IP = '212.85.23.37';

server.listen(PORT, '0.0.0.1' === '0.0.0.0' ? '0.0.0.0' : '0.0.0.0', () => {
    console.log('\n' + '='.repeat(40));
    console.log('🚀 UNDERCOVER SERVER READY');
    console.log(`📡 Local:   http://localhost:${PORT}`);
    console.log(`🌍 Public:  http://${PUBLIC_IP}:${PORT}`);
    console.log('='.repeat(40) + '\n');
});
