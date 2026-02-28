import React, { useState, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
import {
  Shield, Eye, EyeOff, Users, MessageSquare, Send, Vote, Trophy,
  LogOut, Settings, Hash, User, ChevronRight, Play, AlertCircle,
  Copy, CheckCircle2, UserPlus, Info
} from 'lucide-react';

// In production (npm run full), we use the same host. In dev, we might need the exact backend URL.
const socket = io(window.location.hostname === 'localhost' ? 'http://localhost:6002' : undefined);

// --- UI Components ---

const GlassCard = ({ children, className = '', glow = false }) => (
  <div className={`glass p-6 ${className} ${glow ? 'neo-shadow-green' : ''} fade-in relative overflow-hidden`}>
    {children}
  </div>
);

const NeonButton = ({ children, onClick, disabled, variant = 'primary', className = '' }) => {
  const baseStyle = "font-black py-4 px-6 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 tracking-widest uppercase text-sm";
  const variants = {
    primary: "bg-neon-green text-deep-blue hover:brightness-110 shadow-lg shadow-neon-green/20",
    secondary: "bg-white/10 text-white hover:bg-white/20 border border-white/10",
    danger: "bg-spy-red text-white hover:brightness-110 shadow-lg shadow-spy-red/20",
    ghost: "bg-transparent text-white/60 hover:text-white hover:bg-white/5 border border-white/5"
  };

  return (
    <button onClick={onClick} disabled={disabled} className={`${baseStyle} ${variants[variant]} ${className} disabled:opacity-30 disabled:cursor-not-allowed`}>
      {children}
    </button>
  );
};

// --- Main App ---

const App = () => {
  const [gameState, setGameState] = useState(null);
  const [username, setUsername] = useState(localStorage.getItem('undercover_name') || '');
  const [isJoined, setIsJoined] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [description, setDescription] = useState('');
  const [showRole, setShowRole] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [spyChat, setSpyChat] = useState([]);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [votedFor, setVotedFor] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const isAdmin = username?.toUpperCase() === 'DAMI' || username?.toUpperCase() === 'SURU';

  useEffect(() => {
    socket.on('roomCreated', (data) => {
      console.log('Room Created:', data);
      setGameState(data);
      setRoomCode(data.id);
      setIsJoined(true);
      setIsConnecting(false);
    });

    socket.on('joinSuccess', (data) => {
      console.log('Join Success:', data);
      setGameState(data);
      setRoomCode(data.id);
      setIsJoined(true);
      setIsConnecting(false);
    });

    socket.on('roomUpdated', (data) => {
      console.log('Room Updated:', data);
      setGameState(data);
      if (data.status === 'LOBBY') {
        setShowRole(false);
        setVotedFor(null);
      }
      if (data.id && data.id !== roomCode) {
        setRoomCode(data.id);
      }
    });

    socket.on('gameStarted', (data) => {
      console.log('Game Started:', data);
      setGameState(data);
      setShowRole(true);
    });

    socket.on('turnUpdated', (nextId) => {
      console.log('Turn Updated:', nextId);
      setGameState(prev => ({ ...prev, turnOwnerId: nextId }));
    });

    socket.on('descriptionUpdate', (data) => {
      console.log('Description Update:', data);
      setGameState(prev => ({ ...prev, descriptions: data.descriptions }));
    });

    socket.on('waitingForNextPlayer', (playerId) => {
      console.log('Waiting for next player choice from:', playerId);
    });

    socket.on('votingStarted', (data) => {
      console.log('Voting Started:', data);
      setGameState(data);
      setVotedFor(null); // Reset local vote state
    });

    socket.on('voteUpdate', (votes) => {
      console.log('Vote Update:', votes);
      setGameState(prev => ({ ...prev, votes }));
    });

    socket.on('gameEnded', (data) => {
      console.log('Game Ended:', data);
      setGameState(data);
    });

    socket.on('spyChatMessage', (msg) => {
      console.log('Spy Chat:', msg);
      setSpyChat(prev => [...prev, msg]);
    });

    socket.on('error', (msg) => {
      console.error('Socket Error:', msg);
      setError(msg);
      setIsConnecting(false);
      setTimeout(() => setError(''), 3000);
    });

    // Auto-rejoin on mount
    const savedRoom = localStorage.getItem('undercover_room');
    const savedName = localStorage.getItem('undercover_name');
    if (savedRoom && savedName) {
      console.log('Attempting auto-rejoin...', savedName, savedRoom);
      socket.emit('joinRoom', { roomCode: savedRoom, username: savedName });
    }

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

  // Failsafe: If gameState exists, we should be joined
  useEffect(() => {
    if (gameState && !isJoined) {
      console.log('Failsafe: Syncing isJoined state');
      setIsJoined(true);
    }
  }, [gameState, isJoined]);

  const createRoom = () => {
    const trimmedUsername = username.trim();
    if (!trimmedUsername) return setError('Ingresa un nombre');
    localStorage.setItem('undercover_name', trimmedUsername);
    setIsConnecting(true);
    socket.emit('createRoom', { username: trimmedUsername });
  };

  const joinRoom = () => {
    const trimmedUsername = username.trim();
    const trimmedRoomCode = roomCode.trim().toUpperCase();
    if (!trimmedUsername || !trimmedRoomCode) return setError('Nombre y Código requeridos');
    localStorage.setItem('undercover_name', trimmedUsername);
    localStorage.setItem('undercover_room', trimmedRoomCode);
    setIsConnecting(true);
    socket.emit('joinRoom', { roomCode: trimmedRoomCode, username: trimmedUsername });
  };

  const leaveRoom = () => {
    localStorage.removeItem('undercover_room');
    window.location.reload();
  };

  const startGame = () => {
    console.log('Emitting startGame for room:', gameState?.id);
    socket.emit('startGame', gameState.id);
  };
  const submitDescription = () => {
    if (!description) return;
    socket.emit('submitDescription', { roomCode: gameState.id, description });
    setDescription('');
  };
  const chooseNextPlayer = (playerId) => socket.emit('chooseNextPlayer', { roomCode: gameState.id, nextPlayerId: playerId });
  const startVoting = () => socket.emit('startVoting', gameState.id);
  const castVote = (targetId) => {
    socket.emit('castVote', { roomCode: gameState.id, targetId });
    setVotedFor(targetId);
  };
  const sendSpyChat = () => {
    if (!chatMessage) return;
    socket.emit('spyChat', { roomCode: gameState.id, message: chatMessage, username });
    setChatMessage('');
  };
  const adminAction = (action, targetId) => socket.emit('adminAction', { roomCode: gameState.id, action, targetId });
  const updateSettings = (settings) => socket.emit('updateSettings', { roomCode: gameState.id, settings });
  const playAgain = () => {
    console.log('Emitting playAgain for room:', gameState?.id);
    socket.emit('playAgain', gameState.id);
  };

  const copyRoomLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- Render Stages ---

  if (!isJoined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-deep-blue relative overflow-hidden">
        {/* Background Decor */}
        <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-neon-green/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-spy-red/10 rounded-full blur-[100px]" />

        <div className="text-center mb-12 fade-in">
          <div className="flex items-center justify-center gap-4 mb-2">
            <Shield className="text-neon-green" size={48} />
          </div>
          <h1 className="text-6xl md:text-8xl font-black italic tracking-tighter text-white">
            UNDER<span className="text-neon-green">COVER</span>
          </h1>
          <p className="text-slate-500 font-mono text-sm mt-2 tracking-widest uppercase">Secret Agent Deduction Game</p>
        </div>

        <GlassCard className="w-full max-w-md p-8 border-t-2 border-neon-green/30" glow>
          <div className="space-y-6">
            <div className="relative">
              <User className="absolute left-3 top-3.5 text-slate-500" size={20} />
              <input
                type="text"
                placeholder="TU NOMBRE CLAVE"
                className="w-full pl-10 pr-4 py-4 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-neon-green outline-none font-bold uppercase"
                value={username}
                onChange={(e) => setUsername(e.target.value.toUpperCase())}
              />
            </div>

            <div className="grid grid-cols-1 gap-4">
              <NeonButton onClick={createRoom} disabled={isConnecting}>
                {isConnecting ? 'CONECTANDO...' : 'Crear Nueva Operación'} <ChevronRight size={18} />
              </NeonButton>

              <div className="relative flex items-center py-4">
                <div className="flex-grow border-t border-white/10"></div>
                <span className="flex-shrink mx-4 text-slate-500 text-xs font-black">O ÚNETE A UNA</span>
                <div className="flex-grow border-t border-white/10"></div>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Hash className="absolute left-3 top-3.5 text-slate-500" size={20} />
                  <input
                    type="text"
                    placeholder="CÓDIGO"
                    className="w-full pl-10 pr-4 py-4 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-neon-green outline-none font-bold uppercase"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value)}
                  />
                </div>
                <NeonButton onClick={joinRoom} variant="secondary" className="px-8" disabled={isConnecting}>
                  {isConnecting ? '...' : 'Ir'}
                </NeonButton>
              </div>
            </div>

            {error && (
              <div className="flex items-center justify-center gap-2 text-spy-red text-sm font-bold bg-spy-red/10 p-3 rounded-lg animate-bounce">
                <AlertCircle size={16} /> {error}
              </div>
            )}
          </div>
        </GlassCard>

        {/* Admin trigger integrated into header shield */}
      </div>
    );
  }

  const me = gameState?.players.find(p => p.id === socket.id);
  const isMyTurn = gameState?.turnOwnerId === socket.id;

  return (
    <div className="min-h-screen bg-deep-blue text-white flex flex-col font-inter overflow-hidden">
      {/* Immersive Header */}
      <header className="glass m-4 p-4 flex justify-between items-center rounded-2xl border-white/5">
        <div className="flex items-center gap-4">
          <div
            onClick={() => isAdmin && setIsAdminPanelOpen(true)}
            className={`p-2 rounded-xl transition-all ${isAdmin
              ? 'bg-white/10 cursor-pointer hover:scale-110 active:scale-95 animate-rainbow shadow-lg shadow-white/5'
              : 'bg-neon-green/10'
              }`}
          >
            <Shield className={isAdmin ? 'text-white' : 'text-neon-green'} size={24} />
          </div>
          <div>
            <h2 className="text-xs text-slate-500 font-black uppercase tracking-widest">Operación</h2>
            <p className="text-lg font-black font-mono tracking-tighter">{gameState?.id}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowRole(true)}
            className="flex items-center gap-2 bg-white/5 px-4 py-2.5 rounded-xl border border-white/10 hover:bg-white/10 transition-all font-black text-xs uppercase"
          >
            <Eye size={16} /> Ver Rol
          </button>
          <button
            onClick={leaveRoom}
            className="p-2.5 rounded-xl transition-all bg-white/5 text-slate-500 hover:text-spy-red hover:bg-spy-red/10 border border-white/5"
            title="Salir"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-24">
        {gameState?.status === 'LOBBY' && (
          <div className="max-w-2xl mx-auto py-8 space-y-8">
            <div className="text-center">
              <h1 className="text-4xl font-black mb-2 uppercase italic tracking-tighter">Sala de Espera</h1>
              <p className="text-slate-500 font-bold uppercase text-xs tracking-widest">Esperando Agentes ({gameState.players.length}/15)</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {gameState.players.map(p => (
                <div key={p.id} className="glass p-4 rounded-2xl border-white/5 flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-neon-green font-black">
                      {p.username[0]}
                    </div>
                    <div>
                      <span className="font-black text-sm uppercase">{p.username}</span>
                      {p.id === socket.id && <span className="ml-2 py-0.5 px-2 bg-neon-green/10 text-neon-green text-[10px] rounded-full font-black">TÚ</span>}
                    </div>
                  </div>
                  {gameState.creatorId === p.id && <Settings size={14} className="text-slate-500" />}
                </div>
              ))}

              {Array.from({ length: Math.max(0, 6 - gameState.players.length) }).map((_, i) => (
                <div key={i} className="border-2 border-dashed border-white/5 p-4 rounded-2xl flex items-center gap-3 opacity-30">
                  <UserPlus size={20} className="text-slate-500" />
                  <span className="text-xs font-black text-slate-500 italic">ESPERANDO AGENTE...</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-4 items-center">
              <NeonButton onClick={copyRoomLink} variant="secondary" className="w-full max-w-xs">
                {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                {copied ? 'Copiado!' : 'Compartir Sala'}
              </NeonButton>

              {gameState.creatorId === socket.id && (
                <div className="w-full max-w-xs space-y-4">
                  <NeonButton
                    onClick={startGame}
                    disabled={gameState.players.length < 2}
                    className="w-full"
                  >
                    <Play size={18} fill="currentColor" /> INICIAR OPERACIÓN
                  </NeonButton>
                  {gameState.players.length < 2 && (
                    <p className="text-[10px] text-center text-slate-500 font-black uppercase flex items-center justify-center gap-2">
                      <Info size={12} /> Se requieren al menos 2 jugadores
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {gameState?.status === 'PLAYING' && (
          <div className="max-w-xl mx-auto py-6 space-y-6">
            {/* Timeline of descriptions */}
            <div className="space-y-4">
              {gameState.descriptions.map((d, i) => (
                <div key={i} className={`fade-in glass p-4 rounded-2xl border-l-4 ${d.username === username ? 'border-neon-green' : 'border-white/20'}`}>
                  <p className="text-[10px] font-black uppercase text-slate-500 mb-1">{d.username}</p>
                  <p className="text-lg font-bold leading-tight">"{d.text}"</p>
                </div>
              ))}
            </div>

            {/* Turn Interaction */}
            {isMyTurn ? (
              <GlassCard className="border-neon-green shadow-neon-green/10 animate-pulse-slow">
                <div className="flex items-center gap-2 mb-4 text-neon-green">
                  <Play size={16} fill="currentColor" />
                  <h3 className="text-xs font-black uppercase tracking-widest">Es tu turno, Agente</h3>
                </div>

                <div className="space-y-4">
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full bg-white/5 p-4 rounded-xl border border-white/10 outline-none focus:ring-2 focus:ring-neon-green font-bold"
                      placeholder="Describe tu palabra..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && submitDescription()}
                    />
                    <button onClick={submitDescription} className="absolute right-2 top-2 bg-neon-green text-deep-blue p-2 rounded-lg">
                      <Send size={18} />
                    </button>
                  </div>

                  {gameState.descriptions.length > 0 && gameState.descriptions[gameState.descriptions.length - 1].username === username && (
                    <div className="space-y-3 pt-4 border-t border-white/5">
                      <p className="text-xs font-black uppercase text-slate-500">¿Quién sigue?</p>
                      <div className="flex flex-wrap gap-2">
                        {gameState.players.filter(p => p.id !== socket.id).map(p => (
                          <button key={p.id} onClick={() => chooseNextPlayer(p.id)} className="bg-white/5 hover:bg-neon-green hover:text-deep-blue px-4 py-2 rounded-xl text-xs font-black transition-all border border-white/10 uppercase">
                            {p.username}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </GlassCard>
            ) : (
              <div className="text-center p-8 bg-white/5 rounded-3xl border border-white/5 italic text-slate-500 font-bold text-sm">
                En escucha: {gameState.players.find(p => p.id === gameState.turnOwnerId)?.username}...
              </div>
            )}

            {gameState.creatorId === socket.id && (
              <div className="flex justify-center pt-8">
                <NeonButton onClick={startVoting} variant="danger">
                  <Vote size={18} /> Finalizar y Votar
                </NeonButton>
              </div>
            )}
          </div>
        )}

        {gameState?.status === 'VOTING' && (
          <div className="max-w-md mx-auto py-8 space-y-8">
            <div className="text-center">
              <h1 className="text-4xl font-black mb-2 uppercase text-spy-red italic tracking-tighter">Votación</h1>
              <p className="text-slate-500 font-bold uppercase text-xs tracking-widest leading-relaxed">
                Interrogatorio en curso. <br />Elimina a los impostores.
              </p>
            </div>

            <div className="space-y-3">
              {gameState.players.map(p => (
                <button
                  key={p.id}
                  onClick={() => castVote(p.id)}
                  disabled={votedFor !== null}
                  className={`w-full glass p-5 flex justify-between items-center group transition-all rounded-3xl border ${votedFor === p.id
                    ? 'border-neon-green bg-neon-green/10 shadow-lg shadow-neon-green/20'
                    : 'border-white/5 hover:border-spy-red hover:bg-spy-red/10'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-black uppercase">{p.username}</span>
                    {votedFor === p.id && <CheckCircle2 className="text-neon-green" size={16} />}
                  </div>
                  <div className="flex gap-1.5">
                    {Array.from({ length: gameState.votes[p.id] || 0 }).map((_, i) => (
                      <div key={i} className="w-5 h-5 rounded-full bg-spy-red border-2 border-white/20 animate-pulse shadow-glow-red" />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {gameState?.status === 'RESULTS' && (
          <div className="max-w-2xl mx-auto py-12 flex flex-col items-center space-y-12">
            <div className={`p-8 rounded-full ${gameState.winners === 'CIVILIANS' ? 'bg-neon-green/20' : 'bg-spy-red/20'} animate-pulse`}>
              <Trophy size={100} className={gameState.winners === 'CIVILIANS' ? 'text-neon-green' : 'text-spy-red'} />
            </div>

            <div className="text-center">
              <h1 className="text-6xl md:text-8xl font-black italic tracking-tighter leading-none mb-4">
                ¡GANAN LOS <br />
                <span className={gameState.winners === 'CIVILIANS' ? 'text-neon-green' : 'text-spy-red'}>
                  {gameState.winners === 'CIVILIANS' ? 'CIVILES' : 'ESPÍAS'}
                </span>!
              </h1>
            </div>

            <GlassCard className="w-full max-w-md space-y-4">
              <h3 className="text-xs font-black uppercase text-slate-500 border-b border-white/5 pb-2">Manifiesto Revelado</h3>
              {gameState.players.map(p => (
                <div key={p.id} className="flex justify-between items-center py-1">
                  <span className="font-black text-sm uppercase">{p.username}</span>
                  <div className="text-right">
                    <p className={`font-black text-xs ${p.role === 'SPY' ? 'text-spy-red' : 'text-neon-green'}`}>
                      {p.role === 'SPY' ? 'ESPÍA' : p.role === 'MR_WHITE' ? 'INFILTRADO' : 'CIVIL'}
                    </p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">{p.word || p.category}</p>
                  </div>
                </div>
              ))}
            </GlassCard>

            <div className="flex flex-col gap-4 w-full max-w-xs">
              {gameState.creatorId === socket.id ? (
                <NeonButton onClick={playAgain} className="w-full">
                  <Play size={18} fill="currentColor" /> Volver a jugar
                </NeonButton>
              ) : (
                <div className="text-center p-4 bg-white/5 rounded-2xl border border-white/10 italic text-slate-500 font-bold text-xs uppercase tracking-widest animate-pulse">
                  Esperando al administrador...
                </div>
              )}

              <NeonButton onClick={() => window.location.reload()} variant="ghost" className="w-full">
                Salir de la sala
              </NeonButton>
            </div>
          </div>
        )}
      </main>

      {/* Role Reveal Modal */}
      {showRole && me && (
        <div className="fixed inset-0 bg-deep-blue/95 backdrop-blur-3xl flex items-center justify-center p-6 z-[100] fade-in" onClick={() => setShowRole(false)}>
          <div className="max-w-sm w-full text-center space-y-8 role-reveal-animation" onClick={e => e.stopPropagation()}>
            <div className={`mx-auto w-24 h-24 rounded-full flex items-center justify-center ${me.role === 'CIVILIAN' ? 'bg-neon-green/20 text-neon-green' : 'bg-spy-red/20 text-spy-red'}`}>
              <Shield size={64} />
            </div>

            <div className="space-y-2">
              <h2 className="text-xs text-slate-500 uppercase tracking-widest font-black">Tu Identidad Secreta</h2>
              <h1 className={`text-6xl font-black italic tracking-tighter uppercase ${me.role === 'CIVILIAN' ? 'text-neon-green' : 'text-spy-red'}`}>
                {me.role === 'SPY' ? 'ESPÍA' : me.role === 'MR_WHITE' ? 'INFILTRADO' : 'CIVIL'}
              </h1>
            </div>

            <GlassCard className={`border-2 ${me.role === 'CIVILIAN' ? 'border-neon-green' : 'border-spy-red'}`}>
              <p className="text-[10px] text-slate-500 uppercase mb-2 font-black">Tu Objetivo</p>
              <p className="text-3xl font-black tracking-tighter uppercase">
                {me.role === 'SPY' ? `Categoría: ${me.category || '?'}` : (me.word || '...')}
              </p>
            </GlassCard>

            {me.role !== 'CIVILIAN' && (
              <p className="text-spy-red text-sm font-black italic">¡Escurreos entre los civiles y sobrevivid!</p>
            )}

            <NeonButton onClick={() => setShowRole(false)} variant="secondary" className="w-full">
              Entendido, Agente
            </NeonButton>
          </div>
        </div>
      )}

      {/* Spy Channel Drawer */}
      {me?.role === 'SPY' && gameState?.status === 'PLAYING' && (
        <div className="fixed bottom-0 right-0 w-full md:w-96 glass border-t border-white/10 z-50">
          <div className="p-4 bg-spy-red inline-block absolute top-0 left-0 transform -translate-y-full rounded-t-xl text-[10px] font-black tracking-widest uppercase">
            Canal Seguro Enganche
          </div>

          <div className="flex flex-col h-64">
            <div className="p-3 border-b border-white/10 flex justify-between items-center text-[10px] font-black uppercase text-spy-red animate-pulse">
              <span className="flex items-center gap-2 mt-2"><MessageSquare size={12} /> Comunicación Cifrada</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-black/20">
              {spyChat.map((m, i) => (
                <div key={i} className="text-xs">
                  <span className="text-spy-red font-black uppercase mr-2">{m.username}:</span>
                  <span className="text-slate-300 font-bold">{m.message}</span>
                </div>
              ))}
            </div>

            <div className="p-3 bg-white/5 flex gap-2">
              <input
                className="flex-1 bg-white/5 p-3 rounded-xl border border-white/10 outline-none text-xs font-bold"
                placeholder="Coordinar infiltración..."
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendSpyChat()}
              />
              <button onClick={sendSpyChat} className="bg-spy-red text-white p-3 rounded-xl">
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Panel Modal */}
      {isAdminPanelOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center p-6 z-[200]">
          <GlassCard className="max-w-4xl w-full border-2 border-neon-green p-8" glow>
            <div className="flex justify-between items-center mb-8 pb-4 border-b border-white/10">
              <h2 className="text-3xl font-black text-neon-green italic tracking-tighter flex items-center gap-3">
                <Settings size={32} /> PANEL DE CONTROL SUPREMO
              </h2>
              <button onClick={() => setIsAdminPanelOpen(false)} className="text-white hover:text-neon-green transition-colors">
                <LogOut size={32} />
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                  <h3 className="text-xs font-black text-slate-500 uppercase mb-4 tracking-widest">Estado del Sistema</h3>
                  <div className="space-y-2 font-mono text-sm uppercase">
                    <p className="flex justify-between">Fase Actual: <span className="text-neon-green">{gameState?.status}</span></p>
                    <p className="flex justify-between">Transmisión: <span className="text-neon-green">{gameState?.players.find(p => p.id === gameState?.turnOwnerId)?.username || 'NADA'}</span></p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <NeonButton onClick={() => adminAction('reset')} variant="ghost" className="flex-1">Reiniciar</NeonButton>
                  <NeonButton onClick={() => adminAction('start')} variant="primary" className="flex-1">Forzar Inicio</NeonButton>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Base de Datos de Agentes</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                  {gameState?.players.map(p => (
                    <div key={p.id} className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5 text-xs">
                      <div className="flex flex-col">
                        <span className="font-black uppercase tracking-tighter">{p.username}</span>
                        <span className={p.role === 'SPY' ? 'text-spy-red font-black' : 'text-neon-green font-black'}>
                          {p.role} ➔ {p.word || 'DESCONOCIDO'}
                        </span>
                      </div>
                      <button onClick={() => adminAction('kick', p.id)} className="bg-spy-red/20 text-spy-red px-3 py-1 rounded-lg font-black hover:bg-spy-red hover:text-white transition-all uppercase text-[10px]">Expulsar</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Intercepted Chat */}
            <div className="mt-8 pt-8 border-t border-white/10">
              <h3 className="text-[10px] font-black text-neon-green uppercase mb-4 tracking-widest">Señal Interceptada [S-CHAT]</h3>
              <div className="h-32 overflow-y-auto bg-black/40 p-4 rounded-xl border border-white/10 space-y-2">
                {spyChat.map((m, i) => (
                  <p key={i} className="text-[10px] font-mono">
                    <span className="text-spy-red font-black mr-2">[{m.username}]:</span>
                    <span className="text-white/80">{m.message}</span>
                  </p>
                ))}
                {spyChat.length === 0 && <p className="text-[10px] text-slate-700 font-black italic">SILENCIO TOTAL...</p>}
              </div>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
};

export default App;
