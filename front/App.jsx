import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Video, VideoOff, Mic, MicOff, Share2, LogOut, Copy, Plus, LogIn, PhoneOff, Send, MessageCircle, AlertCircle, HelpCircle } from 'lucide-react';

// Change to your deployed Render URL in production (e.g., https://zoom-clone-backend.onrender.com)
const BACKEND_URL = "http://localhost:5000";

export default function App() {
    const [view, setView] = useState('landing'); // 'landing' | 'signup' | 'signin' | 'dashboard' | 'room'
    const [user, setUser] = useState(null);
    const [token, setToken] = useState('');
    
    // Auth inputs
    const [usernameInput, setUsernameInput] = useState('');
    const [emailInput, setEmailInput] = useState('');
    const [passwordInput, setPasswordInput] = useState('');
    const [authError, setAuthError] = useState('');
    const [authSuccess, setAuthSuccess] = useState('');

    // Dashboard state
    const [roomInput, setRoomInput] = useState('');
    const [meetingHistory, setMeetingHistory] = useState([]);
    
    // Meeting Room media flags
    const [activeRoomId, setActiveRoomId] = useState('');
    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);

    // Call participant logs and messaging chat lists
    const [participants, setParticipants] = useState([]);
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [showChatPanel, setShowChatPanel] = useState(true);

    // Dynamic warning alert bar toast
    const [toast, setToast] = useState({ message: '', type: 'info', visible: false });

    // Node connections references
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const socketRef = useRef(null);
    const peerConnectionRef = useRef(null);

    // Restore sessions from localStorage on application load
    useEffect(() => {
        const savedToken = localStorage.getItem('zoom_token');
        const savedUser = localStorage.getItem('zoom_user');
        if (savedToken && savedUser) {
            setToken(savedToken);
            setUser(JSON.parse(savedUser));
            setView('dashboard');
        }
    }, []);

    // Load meeting history logs once logged in
    useEffect(() => {
        if (user && token) {
            fetchMeetingHistory();
        }
    }, [user, token, view]);

    const showToast = (message, type = 'info') => {
        setToast({ message, type, visible: true });
        setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 4000);
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setAuthError('');
        setAuthSuccess('');

        if (!usernameInput || !emailInput || !passwordInput) {
            setAuthError('All credentials are required.');
            return;
        }

        try {
            const res = await fetch(`${BACKEND_URL}/api/users/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: usernameInput, email: emailInput, password: passwordInput })
            });
            const data = await res.json();
            if (data.success) {
                setAuthSuccess(data.message);
                showToast('Successfully registered! Directing to Sign In.', 'success');
                setTimeout(() => {
                    setView('signin');
                    setUsernameInput('');
                }, 1500);
            } else {
                setAuthError(data.message);
            }
        } catch (err) {
            setAuthError('Failed to connect to backend server. Make sure it is running.');
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setAuthError('');

        if (!emailInput || !passwordInput) {
            setAuthError('Please fill in both fields.');
            return;
        }

        try {
            const res = await fetch(`${BACKEND_URL}/api/users/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailInput, password: passwordInput })
            });
            const data = await res.json();
            if (data.success) {
                localStorage.setItem('zoom_token', data.token);
                localStorage.setItem('zoom_user', JSON.stringify(data.user));
                setToken(data.token);
                setUser(data.user);
                setView('dashboard');
                showToast(`Welcome back, ${data.user.username}!`, 'success');
                setEmailInput('');
                setPasswordInput('');
            } else {
                setAuthError(data.message);
            }
        } catch (err) {
            setAuthError('Failed to connect to backend server.');
        }
    };

    const handleSignOut = () => {
        localStorage.removeItem('zoom_token');
        localStorage.removeItem('zoom_user');
        setToken('');
        setUser(null);
        setView('landing');
        showToast('Logged out successfully.', 'info');
    };

    const fetchMeetingHistory = async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/users/history`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setMeetingHistory(data.meetings);
            }
        } catch (err) {
            console.error('Failed to load logs history:', err);
        }
    };

    const startMeeting = async (isNew = true, code = '') => {
        let roomCode = code;
        if (isNew) {
            const randHex = () => Math.floor(100 + Math.random() * 900);
            roomCode = `${randHex()}-${randHex()}-${randHex()}`;
        }

        setActiveRoomId(roomCode);
        setView('room');
        setChatMessages([]);
        setParticipants([]);

        try {
            // 1. Obtain user's local video and audio stream
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            setLocalStream(stream);
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            // 2. Initialize connection with WebSockets backend
            const socket = io(BACKEND_URL);
            socketRef.current = socket;

            socket.emit('join-call', { roomId: roomCode, username: user.username });

            // 3. SECURE peer connections signaling structure
            const configuration = {
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            };
            const pc = new RTCPeerConnection(configuration);
            peerConnectionRef.current = pc;

            // Send local audio & video tracks to the peer connection
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            // Remote stream arrival handler
            pc.ontrack = (event) => {
                setRemoteStream(event.streams[0]);
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = event.streams[0];
                }
            };

            // Send ICE candidates automatically
            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('signal', {
                        targetId: socket.id,
                        signalData: { type: 'candidate', candidate: event.candidate }
                    });
                }
            };

            // Handle peer listing and execute offer if we are not the first in the room
            socket.on('get-all-participants', async (peers) => {
                if (peers.length > 0) {
                    setParticipants(peers.map(p => p.username));
                    // Construct and dispatch handshakes SDP offer to existing user
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    socket.emit('signal', {
                        targetId: peers[0].id,
                        signalData: offer
                    });
                }
            });

            // Process signaling connection offers, answers, and ICEs
            socket.on('signal', async ({ senderId, signalData }) => {
                if (signalData.type === 'offer') {
                    await pc.setRemoteDescription(new RTCSessionDescription(signalData));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    socket.emit('signal', { targetId: senderId, signalData: answer });
                } else if (signalData.type === 'answer') {
                    await pc.setRemoteDescription(new RTCSessionDescription(signalData));
                } else if (signalData.type === 'candidate') {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
                    } catch (e) {
                        console.error('Error applying ICE Candidate:', e);
                    }
                }
            });

            socket.on('user-connected', ({ username }) => {
                setParticipants(prev => [...new Set([...prev, username])]);
                showToast(`${username} entered the room!`, 'success');
            });

            socket.on('chat-message', (payload) => {
                setChatMessages(prev => [...prev, payload]);
            });

            socket.on('user-disconnected', ({ username }) => {
                setRemoteStream(null);
                setParticipants(prev => prev.filter(p => p !== username));
                showToast(`${username} left the meeting.`, 'info');
            });

        } catch (err) {
            console.error('Failed to capture local media streams:', err);
            showToast('Media permissions denied or device missing.', 'error');
            setView('dashboard');
        }
    };

    const handleJoinWithCode = (e) => {
        e.preventDefault();
        if (!roomInput.trim()) {
            showToast('Enter a valid room code.', 'error');
            return;
        }
        startMeeting(false, roomInput.trim());
    };

    const leaveRoom = async () => {
        if (socketRef.current) {
            socketRef.current.disconnect();
        }
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
        }

        // Save session logs to database history before cleaning state
        try {
            await fetch(`${BACKEND_URL}/api/users/history/save`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    meetingCode: activeRoomId,
                    startTime: new Date(Date.now() - 300000).toISOString(), // Estimated 5 min call
                    endTime: new Date().toISOString(),
                    participants: participants.map(p => ({ username: p }))
                })
            });
        } catch (err) {
            console.error('Could not save session log to DB:', err);
        }

        setLocalStream(null);
        setRemoteStream(null);
        setIsMuted(false);
        setIsVideoOff(false);
        setIsScreenSharing(false);
        setView('dashboard');
        showToast('You disconnected from the call.', 'info');
    };

    const toggleAudio = () => {
        if (localStream) {
            const nextStatus = !isMuted;
            localStream.getAudioTracks().forEach(track => track.enabled = !nextStatus);
            setIsMuted(nextStatus);
        }
    };

    const toggleVideo = () => {
        if (localStream) {
            const nextStatus = !isVideoOff;
            localStream.getVideoTracks().forEach(track => track.enabled = !nextStatus);
            setIsVideoOff(nextStatus);
        }
    };

    const toggleScreenShare = async () => {
        try {
            if (!isScreenSharing) {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const screenTrack = screenStream.getVideoTracks()[0];

                if (peerConnectionRef.current) {
                    const senders = peerConnectionRef.current.getSenders();
                    const videoSender = senders.find(s => s.track.kind === 'video');
                    if (videoSender) {
                        videoSender.replaceTrack(screenTrack);
                    }
                }

                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = screenStream;
                }

                screenTrack.onended = () => {
                    stopScreenSharing();
                };

                setIsScreenSharing(true);
                showToast('Screen sharing started.', 'success');
            } else {
                stopScreenSharing();
            }
        } catch (e) {
            console.error(e);
            showToast('Failed to start screen share.', 'error');
        }
    };

    const stopScreenSharing = () => {
        if (localStream && localVideoRef.current) {
            const originalVideoTrack = localStream.getVideoTracks()[0];
            if (peerConnectionRef.current) {
                const senders = peerConnectionRef.current.getSenders();
                const videoSender = senders.find(s => s.track.kind === 'video');
                if (videoSender) {
                    videoSender.replaceTrack(originalVideoTrack);
                }
            }
            localVideoRef.current.srcObject = localStream;
        }
        setIsScreenSharing(false);
        showToast('Screen sharing stopped.', 'info');
    };

    const handleSendChatMessage = (e) => {
        e.preventDefault();
        if (!chatInput.trim() || !socketRef.current) return;

        socketRef.current.emit('chat-message', {
            roomId: activeRoomId,
            message: chatInput.trim()
        });
        setChatInput('');
    };

    const copyMeetingId = () => {
        navigator.clipboard.writeText(activeRoomId);
        showToast('Room ID copied to clipboard!', 'success');
    };

    return (
        <div className="min-h-screen bg-[#0b0f19] text-[#e2e8f0] flex flex-col font-sans antialiased">
            
            {/* Custom toast notifications */}
            {toast.visible && (
                <div className="fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-xl bg-[#161f38] border border-[#2d3a61] shadow-2xl animate-fade-in">
                    <div className={`w-3 h-3 rounded-full ${toast.type === 'success' ? 'bg-emerald-500' : toast.type === 'error' ? 'bg-rose-500' : 'bg-indigo-500'}`} />
                    <span className="text-xs font-semibold tracking-wide text-white">{toast.message}</span>
                </div>
            )}

            {/* Global navigation header */}
            <header className="px-6 py-4 border-b border-[#1f293d] bg-[#0f172a]/80 backdrop-blur-md sticky top-0 z-40 flex items-center justify-between">
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView(user ? 'dashboard' : 'landing')}>
                    <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-600/30">
                        <Video className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-lg font-extrabold text-white tracking-tight uppercase">
                        Zoom<span className="text-indigo-400 font-normal text-xs ml-1 font-mono uppercase tracking-widest bg-indigo-950 px-1.5 py-0.5 rounded">MERN</span>
                    </span>
                </div>

                <div className="flex items-center gap-4">
                    {user ? (
                        <>
                            <span className="hidden sm:inline-block text-xs bg-[#161f38] text-slate-300 font-semibold px-3 py-1.5 rounded-lg border border-[#2d3a61]">
                                User: <strong className="text-indigo-400 font-semibold ml-1">{user.username}</strong>
                            </span>
                            <button onClick={handleSignOut} className="flex items-center gap-2 text-xs font-bold bg-rose-600/10 hover:bg-rose-600 border border-rose-500/20 text-rose-400 hover:text-white px-4 py-2 rounded-xl transition-all">
                                <LogOut className="w-3.5 h-3.5" />
                                Sign Out
                            </button>
                        </>
                    ) : (
                        <div className="flex gap-2.5">
                            <button onClick={() => setView('signin')} className="text-xs font-bold hover:bg-[#161f38] px-4 py-2 rounded-xl transition-all border border-[#1f293d] text-slate-300 flex items-center gap-1.5">
                                <LogIn className="w-3.5 h-3.5" /> Sign In
                            </button>
                            <button onClick={() => setView('signup')} className="text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl transition-all shadow-md shadow-indigo-600/20">
                                Sign Up
                            </button>
                        </div>
                    )}
                </div>
            </header>

            {/* Core view container */}
            <main className="flex-grow flex flex-col">
                
                {/* 1. PUBLIC LANDING VIEW */}
                {view === 'landing' && (
                    <section className="flex-grow flex flex-col lg:flex-row items-center justify-between px-6 lg:px-20 py-12 max-w-7xl mx-auto gap-12">
                        <div className="lg:w-1/2 space-y-6">
                            <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/35 text-indigo-400 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider">
                                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                                Pure WebRTC P2P Streams
                            </div>
                            <h2 className="text-4xl lg:text-5xl font-extrabold text-white leading-tight">
                                High Definition Meetings, built directly for the Web.
                            </h2>
                            <p className="text-[#94a3b8] text-sm leading-relaxed max-w-xl">
                                Welcome to the open-source MERN stack Zoom Clone. Run low-latency, secure P2P WebRTC audio and video streaming, live message chat, screen-sharing, and active user authentication without bloatware dependencies.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4 pt-4">
                                <button onClick={() => setView('signup')} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-7 py-3.5 rounded-xl shadow-lg shadow-indigo-600/35 transition-all flex items-center justify-center gap-2">
                                    Get Started
                                </button>
                                <button onClick={() => setView('signin')} className="bg-[#111827] hover:bg-[#1f293d] border border-[#2d3a61] text-[#cbd5e1] font-bold px-7 py-3.5 rounded-xl transition-all">
                                    Join Room with Code
                                </button>
                            </div>
                        </div>

                        {/* Interactive UI card preview */}
                        <div className="lg:w-1/2 w-full max-w-md bg-[#0f172a] border border-[#1f293d] rounded-3xl p-6 shadow-2xl relative overflow-hidden">
                            <div className="aspect-video rounded-xl bg-[#070a13] border border-[#1f293d] flex flex-col items-center justify-center relative p-6">
                                <div className="p-4 bg-indigo-600/10 border border-indigo-500/30 text-indigo-400 rounded-full mb-3">
                                    <Video className="w-7 h-7" />
                                </div>
                                <span className="text-xs font-bold text-white uppercase tracking-wider">MERN Socket Server Link</span>
                                <span className="text-[10px] text-indigo-400 font-semibold mt-1">Cross-tab Sync Supported</span>
                            </div>
                        </div>
                    </section>
                )}

                {/* 2. AUTHENTICATION PAGES */}
                {view === 'signup' && (
                    <section className="flex-grow flex items-center justify-center px-4 py-12">
                        <div className="w-full max-w-md bg-[#0f172a] border border-[#1f293d] rounded-3xl p-8 shadow-2xl">
                            <h3 className="text-xl font-extrabold text-white mb-1.5">Sign Up for Zoom</h3>
                            <p className="text-[#94a3b8] text-xs mb-6">Create a secure profile to start logging and joining calls.</p>
                            
                            {authError && <div className="mb-4 p-3.5 bg-rose-500/10 border border-rose-500/25 text-rose-400 rounded-xl text-xs font-semibold">{authError}</div>}
                            {authSuccess && <div className="mb-4 p-3.5 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 rounded-xl text-xs font-semibold">{authSuccess}</div>}

                            <form onSubmit={handleRegister} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-2">Username</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. johndoe"
                                        value={usernameInput}
                                        onChange={(e) => setUsernameInput(e.target.value)}
                                        className="w-full bg-[#070a13] border border-[#1f293d] rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all font-semibold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-2">Email Address</label>
                                    <input 
                                        type="email" 
                                        placeholder="e.g. john@mail.com"
                                        value={emailInput}
                                        onChange={(e) => setEmailInput(e.target.value)}
                                        className="w-full bg-[#070a13] border border-[#1f293d] rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all font-semibold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-2">Password</label>
                                    <input 
                                        type="password" 
                                        placeholder="Password (minimum 6 characters)"
                                        value={passwordInput}
                                        onChange={(e) => setPasswordInput(e.target.value)}
                                        className="w-full bg-[#070a13] border border-[#1f293d] rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all font-semibold"
                                    />
                                </div>
                                <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl text-xs uppercase tracking-wider transition-all">
                                    Register Account
                                </button>
                            </form>
                        </div>
                    </section>
                )}

                {view === 'signin' && (
                    <section className="flex-grow flex items-center justify-center px-4 py-12">
                        <div className="w-full max-w-md bg-[#0f172a] border border-[#1f293d] rounded-3xl p-8 shadow-2xl">
                            <h3 className="text-xl font-extrabold text-white mb-1.5">Welcome Back</h3>
                            <p className="text-[#94a3b8] text-xs mb-6">Enter details to authorize your current session.</p>
                            
                            {authError && <div className="mb-4 p-3.5 bg-rose-500/10 border border-rose-500/25 text-rose-400 rounded-xl text-xs font-semibold">{authError}</div>}
                            
                            <form onSubmit={handleLogin} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-2">Email Address</label>
                                    <input 
                                        type="email" 
                                        placeholder="e.g. john@mail.com"
                                        value={emailInput}
                                        onChange={(e) => setEmailInput(e.target.value)}
                                        className="w-full bg-[#070a13] border border-[#1f293d] rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all font-semibold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-2">Password</label>
                                    <input 
                                        type="password" 
                                        placeholder="Enter password"
                                        value={passwordInput}
                                        onChange={(e) => setPasswordInput(e.target.value)}
                                        className="w-full bg-[#070a13] border border-[#1f293d] rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all font-semibold"
                                    />
                                </div>
                                <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl text-xs uppercase tracking-wider transition-all">
                                    Login and Enter
                                </button>
                            </form>
                        </div>
                    </section>
                )}

                {/* 3. DASHBOARD PAGE */}
                {view === 'dashboard' && (
                    <section className="flex-grow p-6 lg:p-10 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8">
                        
                        {/* Core action panels */}
                        <div className="lg:col-span-7 space-y-6">
                            
                            {/* Action block banner */}
                            <div className="bg-gradient-to-r from-indigo-950 to-[#0f172a] border border-indigo-500/20 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                                <div>
                                    <h3 className="text-xl font-bold text-white">Hello, {user?.username}!</h3>
                                    <p className="text-indigo-200/70 text-xs mt-1">Start high-definition calls or join meetings using codes.</p>
                                </div>
                                <button onClick={() => startMeeting(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-3 px-5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 shrink-0">
                                    <Plus className="w-4 h-4" /> New Call Room
                                </button>
                            </div>

                            {/* Join with Code option */}
                            <div className="bg-[#0f172a] border border-[#1f293d] rounded-3xl p-6 space-y-4">
                                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                    <LogIn className="w-4 h-4 text-indigo-400" /> Join Meeting Room
                                </h4>
                                <form onSubmit={handleJoinWithCode} className="flex flex-col sm:flex-row gap-3">
                                    <input 
                                        type="text" 
                                        placeholder="Enter 9-digit Room Code (e.g. 123-456-789)"
                                        value={roomInput}
                                        onChange={(e) => setRoomInput(e.target.value)}
                                        className="flex-grow bg-[#070a13] border border-[#1f293d] rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono tracking-wider font-semibold"
                                    />
                                    <button type="submit" className="bg-[#1e293b] hover:bg-[#334155] border border-[#334155] text-white font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider transition-all">
                                        Join Room
                                    </button>
                                </form>
                            </div>

                        </div>

                        {/* Meeting history log column */}
                        <div className="lg:col-span-5 space-y-6">
                            <div className="bg-[#0f172a] border border-[#1f293d] rounded-3xl p-6 flex flex-col h-full">
                                <h4 className="text-sm font-bold text-white mb-4 flex items-center justify-between border-b border-[#1f293d] pb-3">
                                    <span>Meeting Logs &amp; History</span>
                                    <span className="text-[10px] bg-indigo-950 text-indigo-300 font-mono px-2 py-0.5 rounded border border-indigo-900/40">Secure Logs</span>
                                </h4>
                                
                                {meetingHistory.length === 0 ? (
                                    <div className="flex-grow flex flex-col items-center justify-center py-12 text-center text-[#64748b]">
                                        <div className="p-3 bg-[#070a13] border border-[#1f293d] rounded-2xl mb-3">
                                            <AlertCircle className="w-6 h-6" />
                                        </div>
                                        <p className="text-xs font-semibold">No recent logs recorded.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                                        {meetingHistory.map((item, idx) => (
                                            <div key={idx} className="bg-[#070a13] p-4 rounded-xl border border-[#1f293d] flex items-center justify-between">
                                                <div>
                                                    <p className="text-xs font-mono font-bold text-indigo-400">{item.meetingCode}</p>
                                                    <p className="text-[10px] text-[#64748b] mt-1">
                                                        {new Date(item.startTime).toLocaleDateString()}
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[10px] bg-indigo-600/10 border border-indigo-500/25 text-indigo-300 font-bold px-2 py-1 rounded">
                                                        {item.participants?.length || 1} Users
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                    </section>
                )}

                {/* 4. REAL-TIME VIDEO ROOM COMPONENT */}
                {view === 'room' && (
                    <section className="flex-grow flex flex-col md:flex-row h-[calc(100vh-73px)]">
                        
                        {/* Video call streams area */}
                        <div className="flex-grow bg-[#070a13] p-6 flex flex-col justify-between relative overflow-hidden">
                            
                            {/* Meeting Room overlays info banner */}
                            <div className="flex items-center justify-between z-10">
                                <div className="bg-[#0f172a]/95 border border-[#1f293d] rounded-xl px-4 py-2.5 flex items-center gap-3 shadow-lg">
                                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
                                    <span className="text-xs font-bold font-mono text-indigo-400 tracking-wider select-all">{activeRoomId}</span>
                                    <button onClick={copyMeetingId} className="hover:text-white text-slate-500 transition-colors">
                                        <Copy className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <div className="bg-[#0f172a]/95 border border-[#1f293d] rounded-xl px-4 py-2 text-xs font-bold text-slate-300 shadow-lg">
                                    Participants: <span className="text-white ml-1">{participants.length + 1}</span>
                                </div>
                            </div>

                            {/* Centered streams canvas grid layout */}
                            <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-6 items-center justify-center my-6 max-w-5xl mx-auto w-full">
                                
                                {/* Local camera Stream wrapper */}
                                <div className="relative rounded-2xl overflow-hidden bg-[#0f172a] aspect-video border border-[#1f293d] group shadow-2xl">
                                    {isVideoOff ? (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-[#64748b]">
                                            <div className="w-16 h-16 rounded-full bg-[#070a13] flex items-center justify-center border border-[#1f293d] text-[#64748b] mb-2">
                                                <VideoOff className="w-6 h-6" />
                                            </div>
                                            <span className="text-xs font-bold uppercase tracking-wider">Camera turned off</span>
                                        </div>
                                    ) : (
                                        <video 
                                            ref={localVideoRef} 
                                            autoPlay 
                                            playsInline 
                                            muted 
                                            className="w-full h-full object-cover transform scale-x-[-1]"
                                        />
                                    )}
                                    
                                    <div className="absolute bottom-4 left-4 bg-[#070a13]/85 backdrop-blur border border-[#1f293d] px-3 py-1.5 rounded-lg text-[10px] font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                        <span>{user?.username} (You)</span>
                                        {isMuted && <span className="text-rose-400 text-[8px] bg-rose-500/10 px-1 rounded border border-rose-500/20">Muted</span>}
                                    </div>
                                </div>

                                {/* Remote Peer feed container */}
                                <div className="relative rounded-2xl overflow-hidden bg-[#0f172a] aspect-video border border-[#1f293d] group shadow-2xl">
                                    {!remoteStream ? (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-[#64748b] p-6 text-center">
                                            <div className="w-16 h-16 rounded-full bg-[#070a13] flex items-center justify-center border border-[#1f293d] text-indigo-400 mb-3 animate-pulse">
                                                <Video className="w-6 h-6" />
                                            </div>
                                            <span className="text-sm font-semibold text-white">Waiting for other peers...</span>
                                            <p className="text-[10px] text-[#64748b] mt-1.5 max-w-xs leading-relaxed">
                                                To test WebRTC streaming locally, open this exact page in a secondary tab, log in, and join using room: <strong className="text-indigo-400">{activeRoomId}</strong>.
                                            </p>
                                        </div>
                                    ) : (
                                        <video 
                                            ref={remoteVideoRef} 
                                            autoPlay 
                                            playsInline 
                                            className="w-full h-full object-cover"
                                        />
                                    )}

                                    {remoteStream && (
                                        <div className="absolute bottom-4 left-4 bg-[#070a13]/85 backdrop-blur border border-[#1f293d] px-3 py-1.5 rounded-lg text-[10px] font-bold text-white uppercase tracking-wider">
                                            <span>Remote Peer</span>
                                        </div>
                                    )}
                                </div>

                            </div>

                            {/* Video Call controls actions panel */}
                            <div className="bg-[#0f172a] border border-[#1f293d] p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 max-w-3xl mx-auto w-full z-10 shadow-xl">
                                <div className="flex items-center gap-2">
                                    {/* Mic toggle */}
                                    <button 
                                        onClick={toggleAudio} 
                                        className={`p-3 rounded-xl border transition-all ${isMuted ? 'bg-rose-600 border-rose-500 text-white' : 'bg-[#070a13] hover:bg-[#1e293b] border-[#1f293d] text-[#cbd5e1]'}`}
                                    >
                                        {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                                    </button>

                                    {/* Camera toggle */}
                                    <button 
                                        onClick={toggleVideo} 
                                        className={`p-3 rounded-xl border transition-all ${isVideoOff ? 'bg-rose-600 border-rose-500 text-white' : 'bg-[#070a13] hover:bg-[#1e293b] border-[#1f293d] text-[#cbd5e1]'}`}
                                    >
                                        {isVideoOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                                    </button>
                                </div>

                                <div className="flex items-center gap-2">
                                    {/* Screen share toggle */}
                                    <button 
                                        onClick={toggleScreenShare} 
                                        className={`px-4 py-3 rounded-xl border font-bold text-xs transition-all flex items-center gap-2 ${isScreenSharing ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-[#070a13] hover:bg-[#1e293b] border-[#1f293d] text-[#cbd5e1]'}`}
                                    >
                                        <Share2 className="w-3.5 h-3.5" />
                                        <span>{isScreenSharing ? 'Sharing' : 'Share Screen'}</span>
                                    </button>
                                </div>

                                <div className="flex items-center gap-2.5">
                                    <button 
                                        onClick={() => setShowChatPanel(!showChatPanel)} 
                                        className={`p-3 rounded-xl border transition-all ${showChatPanel ? 'bg-[#1e293b] border-[#334155] text-indigo-400' : 'bg-[#070a13] hover:bg-[#1e293b] border-[#1f293d] text-[#cbd5e1]'}`}
                                    >
                                        <MessageCircle className="w-4 h-4" />
                                    </button>

                                    <button onClick={leaveRoom} className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-5 py-3 rounded-xl shadow-lg shadow-rose-600/15 transition-all flex items-center gap-1.5 uppercase tracking-wider">
                                        <PhoneOff className="w-3.5 h-3.5" /> Leave
                                    </button>
                                </div>
                            </div>

                        </div>

                        {/* Collapsible live in-room side chat log panel */}
                        {showChatPanel && (
                            <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-[#1f293d] bg-[#0f172a] flex flex-col justify-between shadow-2xl h-[300px] md:h-full">
                                
                                <div className="px-5 py-4 border-b border-[#1f293d] flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                        <MessageCircle className="w-4 h-4 text-indigo-400" /> Room Chat
                                    </h4>
                                </div>

                                <div className="flex-grow p-4 overflow-y-auto space-y-3.5">
                                    {chatMessages.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-center text-[#64748b]">
                                            <p className="text-xs font-semibold">No messages yet.</p>
                                        </div>
                                    ) : (
                                        chatMessages.map((msg, idx) => (
                                            <div key={idx} className={`flex flex-col ${msg.sender === user?.username ? 'items-end' : 'items-start'}`}>
                                                <span className="text-[9px] text-[#64748b] mb-0.5 px-1 font-bold">{msg.sender}</span>
                                                <div className={`text-xs px-3.5 py-2.5 rounded-2xl max-w-[90%] break-words ${msg.sender === user?.username ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-[#070a13] text-slate-300 border border-[#1f293d] rounded-tl-none'}`}>
                                                    {msg.text}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                <form onSubmit={handleSendChatMessage} className="p-4 border-t border-[#1f293d] bg-[#0f172a]/60 flex gap-2">
                                    <input 
                                        type="text" 
                                        placeholder="Type messaging content..."
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        className="flex-grow bg-[#070a13] border border-[#1f293d] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-semibold"
                                    />
                                    <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all">
                                        <Send className="w-3.5 h-3.5" />
                                    </button>
                                </form>

                            </div>
                        )}

                    </section>
                )}

            </main>

            <footer className="py-4 border-t border-[#1f293d] bg-[#070a13] text-center text-[10px] text-[#475569] uppercase tracking-widest font-semibold font-mono">
                &copy; Zoom Clone Immersive MERN Application Setup
            </footer>

        </div>
    );
}