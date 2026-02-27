import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { Shield, Eye, EyeOff, Users, MessageSquare, Send, Vote, Trophy, LogOut, Settings } from 'lucide-react';

const socket = io();

const App = () => {
  const [gameState, setGameState] = useState(null);
  const [username, setUsername] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [description, setDescription] = useState('');
  const [showRole, setShowRole] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [spyChat, setSpyChat] = useState([]);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);

  const isAdmin = username === 'DAMI' || username === 'SURU';

  useEffect(() => {
    socket.on('roomCreated', (data) => {
      setGameState(data);
      setRoomCode(data.id);
      setIsJoined(true);
    });

    socket.on('roomUpdated', (data) => setGameState(data));
    socket.on('gameStarted', (data) => setGameState(data));
    socket.on('turnUpdated', (nextId) => {
      setGameState(prev => ({ ...prev, turnOwnerId: nextId }));
    });
    socket.on('descriptionUpdate', (data) => {
      setGameState(prev => ({ ...prev, descriptions: data.descriptions }));
    });
    socket.on('waitingForNextPlayer', (lastSpeakerId) => {
      // This is handled by the UI showing a picker to the last speaker
    });
    socket.on('votingStarted', (data) => setGameState(data));
    socket.on('gameEnded', (data) => setGameState(data));
    socket.on('spyChatMessage', (msg) => setSpyChat(prev => [...prev, msg]));
    socket.on('error', (msg) => setError(msg));

    return () => {
      socket.off('roomCreated');
      socket.off('roomUpdated');
      socket.off('gameStarted');
      socket.off('turnUpdated');
      socket.off('descriptionUpdate');
      socket.off('votingStarted');
      socket.off('gameEnded');
      socket.off('spyChatMessage');
      socket.off('error');
    };
  }, []);

  const createRoom = () => {
    if (!username) return setError('Username is required');
    socket.emit('createRoom', { username });
  };

  const joinRoom = () => {
    if (!username || !roomCode) return setError('Username and Room Code are required');
    socket.emit('joinRoom', { roomCode: roomCode.toUpperCase(), username });
    setIsJoined(true);
  };

  const startGame = () => socket.emit('startGame', gameState.id);

  const submitDescription = () => {
    if (!description) return;
    socket.emit('submitDescription', { roomCode: gameState.id, description });
    setDescription('');
  };

  const chooseNextPlayer = (playerId) => {
    socket.emit('chooseNextPlayer', { roomCode: gameState.id, nextPlayerId: playerId });
  };

  const startVoting = () => socket.emit('startVoting', gameState.id);

  const castVote = (targetId) => {
    socket.emit('castVote', { roomCode: gameState.id, targetId });
  };

  const sendSpyChat = () => {
    if (!chatMessage) return;
    socket.emit('spyChat', { roomCode: gameState.id, message: chatMessage, username });
    setChatMessage('');
  };

  const adminAction = (action, targetId) => {
    socket.emit('adminAction', { roomCode: gameState.id, action, targetId });
  };

  if (!isJoined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-slate-900 text-white">
        <h1 className="text-5xl font-bold mb-8 text-civilian-green drop-shadow-lg">UNDERCOVER</h1>
        <div className="glass p-8 w-full max-w-md shadow-2xl">
          <input
            type="text"
            placeholder="Tu Nombre (Ej: Agent 007)"
            className="w-full p-3 mb-4 bg-slate-800 border border-slate-700 rounded-lg focus:ring-2 focus:ring-civilian-green outline-none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={createRoom} className="flex-1 bg-civilian-green hover:bg-neon-green text-slate-900 font-bold py-3 rounded-lg transition-all active:scale-95">
              CREAR SALA
            </button>
            <div className="flex-1 flex flex-col gap-2">
              <input
                type="text"
                placeholder="Código"
                className="p-3 bg-slate-800 border border-slate-700 rounded-lg focus:ring-2 focus:ring-civilian-green outline-none uppercase"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
              />
              <button onClick={joinRoom} className="bg-slate-700 hover:bg-slate-600 font-bold py-3 rounded-lg transition-all active:scale-95">
                UNIRSE
              </button>
            </div>
          </div>
          {error && <p className="text-spy-red mt-4 text-center animate-pulse">{error}</p>}
        </div>

        {/* Hidden Admin Pixel */}
        {isAdmin && (
          <div
            onClick={() => setIsAdminPanelOpen(true)}
            className="fixed bottom-1 right-1 w-2 h-2 cursor-pointer opacity-20"
          />
        )}
      </div>
    );
  }

  const me = gameState?.players.find(p => p.id === socket.id);
  const isMyTurn = gameState?.turnOwnerId === socket.id;

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white overflow-hidden">
      {/* Header */}
      <div className="bg-slate-850 border-b border-slate-700 p-4 flex justify-between items-center glass rounded-none">
        <div>
          <span className="text-civilian-green font-mono">SALA: {gameState?.id}</span>
          <span className="ml-4 text-slate-400 text-sm">{gameState?.players.length} Espías en cubierto</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowRole(!showRole)} className="flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-full border border-slate-600 hover:bg-slate-700">
            {showRole ? <EyeOff size={18} /> : <Eye size={18} />}
            {showRole ? 'Ocultar Rol' : 'Ver Mi Rol'}
          </button>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
        {/* Game Phase UI */}
        {gameState?.status === 'LOBBY' && (
          <div className="flex flex-col items-center justify-center space-y-6 mt-12">
            <h2 className="text-3xl font-bold">Lobby de Espera</h2>
            <div className="grid grid-cols-2 gap-4 w-full max-w-md">
              {gameState.players.map(p => (
                <div key={p.id} className="glass p-4 flex items-center gap-3">
                  <Users className="text-civilian-green" />
                  <span>{p.username} {p.id === socket.id && '(Tú)'}</span>
                </div>
              ))}
            </div>
            {gameState.creatorId === socket.id && (
              <button
                onClick={startGame}
                disabled={gameState.players.length < 4}
                className="bg-civilian-green hover:bg-neon-green text-slate-900 font-bold py-4 px-12 rounded-full text-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shadow-lg shadow-civilian-green/20"
              >
                INICIAR OPERACIÓN
              </button>
            )}
            {gameState.players.length < 4 && <p className="text-slate-400 italic">Esperando a más agentes (Mínimo 4)...</p>}
          </div>
        )}

        {gameState?.status === 'PLAYING' && (
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Description History */}
            <div className="space-y-3">
              {gameState.descriptions.map((d, i) => (
                <div key={i} className={`p-3 rounded-lg glass border-l-4 ${d.username === username ? 'border-civilian-green' : 'border-slate-500'}`}>
                  <span className="text-xs font-bold text-slate-400 block mb-1">{d.username} dijo:</span>
                  <p className="text-lg">"{d.text}"</p>
                </div>
              ))}
            </div>

            {/* Turn Controls */}
            {isMyTurn ? (
              <div className="glass p-6 border-2 border-civilian-green shadow-xl shadow-civilian-green/10 animate-pulse-slow">
                <h3 className="text-xl font-bold mb-4">¡Es tu turno!</h3>
                <p className="mb-4 text-slate-300">Describe tu palabra/categoría sin dar demasiadas pistas:</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 bg-slate-800 p-3 rounded-lg outline-none focus:ring-2 focus:ring-civilian-green"
                    placeholder="Escribe aquí..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && submitDescription()}
                  />
                  <button onClick={submitDescription} className="bg-civilian-green text-slate-900 p-3 rounded-lg">
                    <Send />
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center p-8 bg-slate-800/50 rounded-xl border border-slate-700 italic text-slate-400">
                Esperando a {gameState.players.find(p => p.id === gameState.turnOwnerId)?.username}...
              </div>
            )}

            {/* Next Player Picker (shown after submission) */}
            {gameState.descriptions.length > 0 && gameState.descriptions[gameState.descriptions.length - 1].username === username && isMyTurn && !description && (
              <div className="glass p-6 border-2 border-amber-400 animate-bounce">
                <h3 className="text-xl font-bold mb-4">¿Quién sigue?</h3>
                <div className="flex flex-wrap gap-2">
                  {gameState.players.filter(p => p.id !== socket.id).map(p => (
                    <button key={p.id} onClick={() => chooseNextPlayer(p.id)} className="bg-slate-700 hover:bg-amber-400 hover:text-slate-900 px-4 py-2 rounded-full transition-colors">
                      {p.username}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {gameState.creatorId === socket.id && (
              <div className="flex justify-center mt-8">
                <button onClick={startVoting} className="bg-spy-red hover:bg-red-600 px-8 py-3 rounded-full font-bold shadow-lg">
                  FINALIZAR RONDAS Y VOTAR
                </button>
              </div>
            )}
          </div>
        )}

        {gameState?.status === 'VOTING' && (
          <div className="max-w-md mx-auto space-y-6">
            <h2 className="text-3xl font-bold text-center text-spy-red">FASE DE VOTACIÓN</h2>
            <p className="text-center text-slate-400">Elimina a los Espías. Tienes votos limitados.</p>
            <div className="space-y-3">
              {gameState.players.map(p => (
                <button
                  key={p.id}
                  onClick={() => castVote(p.id)}
                  className="w-full glass p-4 flex justify-between items-center hover:bg-spy-red/20 transition-all border border-slate-700 hover:border-spy-red"
                >
                  <span className="text-xl">{p.username}</span>
                  <div className="flex gap-1">
                    {Array.from({ length: gameState.votes[p.id] || 0 }).map((_, i) => (
                      <div key={i} className="w-4 h-4 rounded-full bg-spy-red animate-pulse" />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {gameState?.status === 'RESULTS' && (
          <div className="flex flex-col items-center justify-center space-y-8 mt-12 animate-in fade-in zoom-in duration-500">
            <Trophy size={80} className={gameState.winners === 'CIVILIANS' ? 'text-civilian-green' : 'text-spy-red'} />
            <h1 className="text-6xl font-black text-center tracking-tighter">
              ¡GANAN LOS <br />
              <span className={gameState.winners === 'CIVILIANS' ? 'text-civilian-green' : 'text-spy-red'}>
                {gameState.winners}
              </span>!
            </h1>
            <div className="glass p-6 w-full max-w-md space-y-4">
              <h3 className="font-bold border-b border-slate-700 pb-2">Revelación de Roles:</h3>
              {gameState.players.map(p => (
                <div key={p.id} className="flex justify-between items-center">
                  <span>{p.username}</span>
                  <span className={`font-mono text-sm ${p.role === 'SPY' ? 'text-spy-red' : 'text-civilian-green'}`}>{p.role} ({p.word || '???'})</span>
                </div>
              ))}
            </div>
            <button onClick={() => window.location.reload()} className="bg-white text-slate-900 px-12 py-3 rounded-full font-bold">
              NUEVO JUEGO
            </button>
          </div>
        )}
      </main>

      {/* Role Card Overlay */}
      {showRole && me && (
        <div className="fixed inset-0 bg-slate-950/90 flex items-center justify-center p-6 z-50" onClick={() => setShowRole(false)}>
          <div className="glass p-12 max-w-sm w-full text-center border-4 border-slate-700 relative overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className={`absolute top-0 left-0 w-full h-2 ${me.role === 'SPY' ? 'bg-spy-red' : 'bg-civilian-green'}`} />
            <Shield className={`mx-auto mb-6 ${me.role === 'SPY' ? 'text-spy-red' : 'text-civilian-green'}`} size={64} />
            <h2 className="text-sm text-slate-400 uppercase tracking-widest mb-2 font-black">Eres un</h2>
            <h1 className={`text-4xl font-black mb-8 ${me.role === 'SPY' ? 'text-spy-red' : 'text-civilian-green'}`}>
              {me.role === 'SPY' ? 'ESPÍA' : me.role === 'MR_WHITE' ? 'INFILTRADO' : 'CIVIL'}
            </h1>
            <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
              <p className="text-xs text-slate-500 uppercase mb-1">Tu Palabra Clave:</p>
              <p className="text-2xl font-bold tracking-tight">
                {me.role === 'SPY' ? `Categoría: ${me.category}` : me.word}
              </p>
            </div>
            {me.role === 'SPY' && (
              <div className="mt-6 text-sm text-spy-red font-bold">
                ¡Encuentra a tus aliados y sobrevive!
              </div>
            )}
            <p className="mt-8 text-slate-500 text-xs">(Haz clic fuera para ocultar)</p>
          </div>
        </div>
      )}

      {/* Spy Private Chat (Persistent Drawer) */}
      {me?.role === 'SPY' && gameState?.status === 'PLAYING' && (
        <div className="fixed bottom-0 right-0 w-full md:w-80 bg-slate-850 border-t md:border-l border-slate-700 glass rounded-none z-30">
          <div className="p-3 border-b border-slate-700 flex justify-between items-center bg-spy-red/10">
            <span className="flex items-center gap-2 text-spy-red font-bold animate-pulse">
              <MessageSquare size={16} /> CANAL SEGURO [SPIES]
            </span>
            <div className="flex gap-1">
              {gameState.players.filter(p => p.role === 'SPY').map(p => (
                <div key={p.id} className="w-2 h-2 rounded-full bg-spy-red" title={p.username} />
              ))}
            </div>
          </div>
          <div className="h-48 overflow-y-auto p-3 space-y-2 text-sm bg-slate-900/50">
            {spyChat.map((m, i) => (
              <div key={i}>
                <span className="text-spy-red font-bold">{m.username}:</span> {m.message}
              </div>
            ))}
          </div>
          <div className="p-2 flex gap-2">
            <input
              className="flex-1 bg-slate-800 p-2 rounded outline-none text-xs"
              placeholder="Habla con tus aliados..."
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendSpyChat()}
            />
            <button onClick={sendSpyChat} className="bg-spy-red text-white p-2 rounded">
              <Send size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Admin Panel Modal */}
      {isAdminPanelOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-[60]">
          <div className="glass p-8 max-w-2xl w-full border-4 border-neon-green">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-neon-green flex items-center gap-2">
                <Settings /> MODO DIOS ACTIVADO
              </h2>
              <button onClick={() => setIsAdminPanelOpen(false)} className="text-slate-400 hover:text-white">
                <LogOut />
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-bold border-b border-slate-700">Estado de Operación</h3>
                <div className="text-sm space-y-2">
                  <p>Fase: <span className="text-neon-green">{gameState?.status}</span></p>
                  <p>Turno: <span className="text-neon-green">{gameState?.players.find(p => p.id === gameState?.turnOwnerId)?.username}</span></p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => adminAction('reset')} className="bg-slate-700 px-4 py-2 rounded text-sm font-bold">REINICIAR SALA</button>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold border-b border-slate-700">Manifiesto de Agentes</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                  {gameState?.players.map(p => (
                    <div key={p.id} className="text-xs flex justify-between items-center p-2 bg-slate-800 rounded">
                      <span>{p.username} ➔ <span className={p.role === 'SPY' ? 'text-spy-red' : 'text-neon-green'}>{p.role}</span></span>
                      <button onClick={() => adminAction('kick', p.id)} className="text-spy-red hover:underline">EXPULSAR</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8 p-4 bg-slate-900 rounded border border-neon-green/30">
              <h3 className="text-xs text-neon-green font-bold mb-2">INTERCEPTACIÓN DE COMUNICACIONES</h3>
              <div className="h-24 overflow-y-auto text-xs text-slate-400">
                {spyChat.map((m, i) => (
                  <p key={i}>[SPY-CHAT] <span className="text-spy-red">{m.username}:</span> {m.message}</p>
                ))}
                {spyChat.length === 0 && <p className="italic text-slate-600">No hay señales detectadas...</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
