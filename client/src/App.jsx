import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, CameraOff, User, Activity, Send, Trash2, Copy, Check } from 'lucide-react';

const CONFIG = {
  CAMERA: { video: { facingMode: "user" }, audio: true },
  AI: { REQUIRED_HOLD_FRAMES: 15, POLL_INTERVAL: 100 },
  ICE_SERVERS: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
  WS_URL: 'ws://localhost:5000'
};

// --- SERVICES ---
const loadScript = (src) => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(true); return; }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error(`Failed to load script ${src}`));
    document.body.appendChild(script);
  });
};

class GestureService {
  static detect(landmarks) {
    const isUp = (tipIdx) => landmarks[tipIdx][1] < landmarks[tipIdx-2][1];
    const thumbExtended = Math.abs(landmarks[4][0] - landmarks[5][0]) > 30;
    const state = { thumb: thumbExtended, index: isUp(8), middle: isUp(12), ring: isUp(16), pinky: isUp(20) };

    if (state.thumb && !state.index && !state.middle && !state.ring && !state.pinky) return { type: 'COMMAND', value: 'SEND', label: '👍 Send' };
    if (!state.thumb && !state.index && !state.middle && !state.ring && !state.pinky) return { type: 'COMMAND', value: 'BACKSPACE', label: '✊ Delete' };
    if (state.index && state.middle && state.ring && state.pinky) return { type: 'WORD', value: 'Hello', label: '🖐️ Hello' };
    if (state.index && state.middle && !state.ring && !state.pinky) return { type: 'WORD', value: 'Peace', label: '✌️ Peace' };
    if (state.index && !state.middle && !state.ring && !state.pinky && !state.thumb) return { type: 'WORD', value: 'I', label: '☝️ I / Me' };
    if (state.thumb && state.index && !state.middle && !state.ring && state.pinky) return { type: 'WORD', value: 'Love', label: '🤟 Love' };
    if (state.thumb && !state.index && !state.middle && !state.ring && state.pinky) return { type: 'WORD', value: 'Thank You', label: '🤙 Thank You' };
    if (state.thumb && state.index && !state.middle && !state.ring && !state.pinky) return { type: 'WORD', value: 'You', label: '👆 You' };

    return { type: 'WAIT', value: null, label: 'Thinking...' };
  }
}

// --- HOOKS ---
const useHandTracking = (videoRef, canvasRef, onGesture) => {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('Init AI...');
  const [model, setModel] = useState(null);
  const buffer = useRef({ name: null, count: 0 });

  useEffect(() => {
    const init = async () => {
      try {
        if (!window.tf) await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs");
        if (!window.handpose) await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow-models/handpose");
        await window.tf.ready();
        const net = await window.handpose.load();
        setModel(net);
        setLoading(false);
        setStatus('Ready');
      } catch (err) { console.error(err); setStatus('AI Error'); }
    };
    init();
  }, []);

  const run = useCallback(async () => {
    if (!model || !videoRef.current || videoRef.current.readyState !== 4) return;
    const video = videoRef.current;
    const { videoWidth, videoHeight } = video;

    video.width = videoWidth; video.height = videoHeight;
    if (canvasRef.current) { canvasRef.current.width = videoWidth; canvasRef.current.height = videoHeight; }

    const predictions = await model.estimateHands(video);
    const ctx = canvasRef.current?.getContext('2d');

    if (ctx) {
      ctx.clearRect(0, 0, videoWidth, videoHeight);
      if (predictions.length > 0) {
        const landmarks = predictions[0].landmarks;
        ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 2;
        for(let i=0; i<landmarks.length; i++) {
          ctx.beginPath(); ctx.arc(landmarks[i][0], landmarks[i][1], 3, 0, 3*Math.PI); ctx.fillStyle='#00ff00'; ctx.fill();
        }
        const gesture = GestureService.detect(landmarks);
        setStatus(gesture.label);

        if (gesture.type !== 'WAIT') {
          if (buffer.current.name === gesture.value) buffer.current.count++;
          else { buffer.current.name = gesture.value; buffer.current.count = 1; }

          if (buffer.current.count === CONFIG.AI.REQUIRED_HOLD_FRAMES) {
            onGesture(gesture);
            buffer.current.count = 0; buffer.current.name = null;
          }
        }
      } else { setStatus('No Hand'); buffer.current.count = 0; }
    }
  }, [model, videoRef, canvasRef, onGesture]);

  useEffect(() => {
    const interval = setInterval(run, CONFIG.AI.POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [run]);

  return { loading, status };
};

// --- COMPONENT ---
export default function App() {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  const [videoOn, setVideoOn] = useState(true);
  const [inCall, setInCall] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [currentRoomId, setCurrentRoomId] = useState('');
  const [sentence, setSentence] = useState([]);
  const [messages, setMessages] = useState([]);
  const [remoteCaptions, setRemoteCaptions] = useState([]);
  const [copied, setCopied] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  const handleGestureEvent = useCallback((gesture) => {
    if (gesture.type === 'COMMAND') {
      if (gesture.value === 'SEND') {
        if (sentence.length > 0) {
          const text = sentence.join(' ');
          const timestamp = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
          setMessages(prev => [...prev, { text, timestamp, isUser: true }]);
          
          // Send caption via WebSocket
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && currentRoomId) {
            wsRef.current.send(JSON.stringify({
              type: 'caption',
              roomId: currentRoomId,
              text,
              timestamp
            }));
          }
          
          setSentence([]);
        }
      } else if (gesture.value === 'BACKSPACE') setSentence(prev => prev.slice(0, -1));
    } else if (gesture.type === 'WORD') setSentence(prev => [...prev, gesture.value]);
  }, [sentence, currentRoomId]);

  const { loading, status } = useHandTracking(localVideoRef, canvasRef, handleGestureEvent);

  // WebSocket connection
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(CONFIG.WS_URL);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsConnected(true);
        if (currentRoomId) {
          ws.send(JSON.stringify({ type: 'join', roomId: currentRoomId }));
        }
      };

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'user_connected') {
          console.log('User connected:', data.userId);
          // Create offer for new peer
          if (peerConnectionRef.current && localStreamRef.current) {
            const offer = await peerConnectionRef.current.createOffer();
            await peerConnectionRef.current.setLocalDescription(offer);
            ws.send(JSON.stringify({
              type: 'signal',
              target: data.userId,
              signal: offer
            }));
          }
        } else if (data.type === 'caption') {
          setRemoteCaptions(prev => [...prev, { text: data.text, timestamp: data.timestamp }].slice(-3));
          setTimeout(() => {
            setRemoteCaptions(prev => prev.slice(1));
          }, 5000);
        } else if (data.type === 'signal') {
          if (!peerConnectionRef.current) return;

          if (data.signal.type === 'offer') {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.signal));
            const answer = await peerConnectionRef.current.createAnswer();
            await peerConnectionRef.current.setLocalDescription(answer);
            ws.send(JSON.stringify({
              type: 'signal',
              target: data.sender,
              signal: answer
            }));
          } else if (data.signal.type === 'answer') {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.signal));
          } else if (data.signal.candidate) {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.signal));
          }
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setWsConnected(false);
        // Attempt reconnection
        if (inCall) {
          reconnectTimerRef.current = setTimeout(() => {
            connectWebSocket();
          }, 3000);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  }, [currentRoomId, inCall]);

  useEffect(() => {
    if (inCall) {
      connectWebSocket();
    }
    
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [inCall, connectWebSocket]);

  // Start local video
  useEffect(() => {
    const startLocalVideo = async () => {
      if (videoOn) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(CONFIG.CAMERA);
          localStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        } catch(e) { console.error('Error accessing camera:', e); }
      } else {
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => track.stop());
          localStreamRef.current = null;
        }
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = null;
        }
      }
    };
    startLocalVideo();
  }, [videoOn]);

  const joinCall = async () => {
    if (!roomId.trim()) return;

    setInCall(true);
    setCurrentRoomId(roomId);

    // Create peer connection
    peerConnectionRef.current = new RTCPeerConnection(CONFIG.ICE_SERVERS);

    // Add local stream to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        peerConnectionRef.current.addTrack(track, localStreamRef.current);
      });
    }

    // Handle incoming remote stream
    peerConnectionRef.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    // Handle ICE candidates
    peerConnectionRef.current.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'signal',
          target: 'broadcast',
          signal: event.candidate
        }));
      }
    };
  };

  const leaveCall = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setInCall(false);
    setCurrentRoomId('');
    setMessages([]);
    setRemoteCaptions([]);
    setWsConnected(false);
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(currentRoomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!inCall) {
    return (
      <div style={styles.joinScreen}>
        <div style={styles.joinCard}>
          <Activity size={40} color="#3b82f6" />
          <h1 style={styles.joinTitle}>SignBridge Video Call</h1>
          <p style={styles.joinSubtitle}>Enter a room ID to start or join a call</p>
          
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Enter Room ID (e.g., room123)"
            style={styles.input}
            onKeyPress={(e) => e.key === 'Enter' && joinCall()}
          />
          
          <button onClick={joinCall} style={styles.joinButton}>
            Join Call
          </button>
          
          <div style={styles.hint}>
            <p>💡 Share the same Room ID with another person to connect</p>
            <p style={{marginTop: '10px', fontSize: '12px', color: '#666'}}>
              Note: Requires WebSocket server running on localhost:5000
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.appContainer}>
      <header style={styles.header}>
        <div style={styles.logoGroup}>
          <Activity size={20} color="#3b82f6" />
          <span style={styles.title}>SignBridge <span style={styles.badge}>LIVE</span></span>
        </div>
        <div style={styles.roomInfo}>
          <div style={{...styles.statusDot, backgroundColor: wsConnected ? '#22c55e' : '#ef4444', marginRight: '8px'}}></div>
          <span style={{ fontSize: '12px', color: '#aaa' }}>Room: {currentRoomId}</span>
          <button onClick={copyRoomId} style={styles.copyBtn}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
        <button onClick={leaveCall} style={styles.leaveBtn}>Leave Call</button>
      </header>

      <div style={styles.main}>
        <div style={styles.videoStage}>
          {/* Local Video */}
          <div style={styles.videoContainer}>
            {loading && <div style={styles.loadingOverlay}>Initializing AI...</div>}
            {!videoOn && <div style={styles.cameraOffOverlay}>Camera Off</div>}
            <video ref={localVideoRef} style={styles.video} muted playsInline autoPlay />
            <canvas ref={canvasRef} style={styles.canvas} />
            
            <div style={styles.statusBadge}>
              <div style={{...styles.statusDot, backgroundColor: status === 'No Hand' ? 'red' : '#22c55e'}}></div>
              {status}
            </div>

            <div style={styles.videoLabel}>You</div>

            {/* Show your sent captions on your video */}
            <div style={styles.captionOverlay}>
              {messages.slice(-3).map((msg, i) => (
                msg.isUser && <div key={i} style={styles.captionText}>{msg.text}</div>
              ))}
            </div>
          </div>

          {/* Remote Video */}
          <div style={styles.videoContainer}>
            <video ref={remoteVideoRef} style={styles.video} playsInline autoPlay />
            <div style={styles.videoLabel}>Remote User</div>
            
            {/* Show remote captions on remote video */}
            <div style={styles.captionOverlay}>
              {remoteCaptions.map((caption, i) => (
                <div key={i} style={styles.captionText}>{caption.text}</div>
              ))}
            </div>
          </div>

          <div style={styles.controls}>
            <button 
              onClick={() => setVideoOn(!videoOn)} 
              style={{...styles.btn, backgroundColor: videoOn ? '#374151' : '#dc2626'}}
            >
              {videoOn ? <Camera/> : <CameraOff/>}
            </button>
          </div>
        </div>

        {/* CHAT PANEL */}
        <div style={styles.chatPanel}>
          <div style={styles.bufferArea}>
            <div style={styles.bufferHeader}>
              <span>GESTURE BUFFER</span>
              <span style={{fontSize: '10px', color: '#666'}}>👍 Send | ✊ Delete</span>
            </div>
            <div style={styles.bufferBox}>
              {sentence.length === 0 ? <span style={{color: '#666', fontStyle: 'italic'}}>Gestures appear here...</span> : 
                sentence.map((word, i) => <span key={i} style={styles.wordChip}>{word}</span>)
              }
            </div>
            <div style={styles.manualControls}>
               <button onClick={() => setSentence(prev => prev.slice(0, -1))} style={styles.iconBtn}><Trash2 size={16}/></button>
               <button 
                 onClick={() => {
                   if (sentence.length > 0) {
                     const text = sentence.join(' ');
                     const timestamp = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                     setMessages(prev => [...prev, { text, timestamp, isUser: true }]);
                     if (wsRef.current?.readyState === WebSocket.OPEN && currentRoomId) {
                       wsRef.current.send(JSON.stringify({
                         type: 'caption',
                         roomId: currentRoomId,
                         text,
                         timestamp
                       }));
                     }
                     setSentence([]);
                   }
                 }} 
                 style={styles.iconBtn}
               >
                 <Send size={16}/>
               </button>
            </div>
          </div>

          <div style={styles.chatHistory}>
            <div style={styles.chatTitle}>Message History</div>
            {messages.map((m, i) => (
              <div key={i} style={{...styles.messageRow, alignItems: m.isUser ? 'flex-end' : 'flex-start'}}>
                <div style={{...styles.bubble, backgroundColor: m.isUser ? '#2563eb' : '#374151'}}>
                  {m.text}
                </div>
                <span style={styles.timestamp}>{m.timestamp}</span>
              </div>
            ))}
            {messages.length === 0 && (
              <div style={{color: '#666', textAlign: 'center', marginTop: '20px', fontSize: '13px'}}>
                No messages yet. Use gestures to communicate!
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  joinScreen: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#0f1115', padding: '20px' },
  joinCard: { backgroundColor: '#161920', padding: '40px', borderRadius: '12px', textAlign: 'center', maxWidth: '400px', width: '100%', border: '1px solid #333' },
  joinTitle: { fontSize: '24px', fontWeight: 'bold', marginTop: '20px', marginBottom: '10px' },
  joinSubtitle: { color: '#aaa', fontSize: '14px', marginBottom: '30px' },
  input: { width: '100%', padding: '12px', backgroundColor: '#0a0a0a', border: '1px solid #333', borderRadius: '8px', color: 'white', fontSize: '14px', marginBottom: '20px' },
  joinButton: { width: '100%', padding: '12px', backgroundColor: '#2563eb', color: 'white', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', border: 'none', fontSize: '16px' },
  hint: { marginTop: '20px', padding: '15px', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', fontSize: '13px', color: '#93c5fd' },

  appContainer: { display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#0f1115', color: 'white', fontFamily: 'sans-serif' },
  header: { height: '60px', backgroundColor: '#161920', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px' },
  logoGroup: { display: 'flex', alignItems: 'center', gap: '10px' },
  title: { fontWeight: 'bold', fontSize: '18px' },
  badge: { fontSize: '10px', backgroundColor: '#dc2626', color: 'white', padding: '2px 6px', borderRadius: '10px', marginLeft: '5px' },
  roomInfo: { display: 'flex', alignItems: 'center', gap: '10px' },
  copyBtn: { padding: '4px 8px', backgroundColor: '#374151', borderRadius: '6px', cursor: 'pointer', border: 'none', color: '#aaa' },
  leaveBtn: { padding: '8px 16px', backgroundColor: '#dc2626', borderRadius: '8px', cursor: 'pointer', border: 'none', color: 'white', fontWeight: 'bold' },
  
  main: { flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' },
  
  videoStage: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'black', gap: '20px' },
  videoContainer: { position: 'relative', width: '100%', maxWidth: '600px', aspectRatio: '16/9', backgroundColor: '#111', borderRadius: '12px', overflow: 'hidden', border: '1px solid #333' },
  video: { width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' },
  canvas: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' },
  loadingOverlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.8)', color: '#60a5fa', zIndex: 10 },
  cameraOffOverlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', color: '#666', fontSize: '18px', zIndex: 10 },
  statusBadge: { position: 'absolute', top: '15px', left: '15px', padding: '5px 10px', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', border: '1px solid rgba(255,255,255,0.1)' },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%' },
  videoLabel: { position: 'absolute', bottom: '15px', left: '15px', padding: '5px 10px', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: '6px', fontSize: '12px' },
  captionOverlay: { position: 'absolute', bottom: '50px', left: '15px', right: '15px', display: 'flex', flexDirection: 'column', gap: '8px' },
  captionText: { backgroundColor: 'rgba(0,0,0,0.8)', padding: '8px 12px', borderRadius: '6px', fontSize: '14px', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' },
  
  controls: { display: 'flex', gap: '20px' },
  btn: { padding: '15px', borderRadius: '50%', border: 'none', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' },
  
  chatPanel: { width: '350px', backgroundColor: '#161920', borderLeft: '1px solid #333', display: 'flex', flexDirection: 'column' },
  
  bufferArea: { padding: '20px', borderBottom: '1px solid #333', backgroundColor: '#111318' },
  bufferHeader: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#60a5fa', marginBottom: '10px', fontWeight: 'bold' },
  bufferBox: { minHeight: '60px', backgroundColor: '#0a0a0a', border: '1px solid #333', borderRadius: '8px', padding: '10px', display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '10px' },
  wordChip: { backgroundColor: 'rgba(37, 99, 235, 0.2)', color: '#bfdbfe', padding: '4px 8px', borderRadius: '4px', fontSize: '13px', border: '1px solid rgba(37, 99, 235, 0.3)' },
  manualControls: { display: 'flex', justifyContent: 'flex-end', gap: '10px' },
  iconBtn: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '5px' },
  
  chatHistory: { flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' },
  chatTitle: { fontSize: '12px', color: '#60a5fa', fontWeight: 'bold', marginBottom: '10px' },
  messageRow: { display: 'flex', flexDirection: 'column', maxWidth: '100%' },
  bubble: { padding: '10px 15px', color: 'white', fontSize: '14px', maxWidth: '85%', wordWrap: 'break-word', borderRadius: '12px' },
  timestamp: { fontSize: '10px', color: '#6b7280', marginTop: '4px', marginLeft: '5px' },
};