import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, Video, Mic, MicOff, PhoneOff, User, Activity, Send, Trash2 } from 'lucide-react';

// --- CONFIGURATION ---
const CONFIG = {
  CAMERA: { video: { facingMode: "user" }, audio: false },
  AI: { REQUIRED_HOLD_FRAMES: 15, POLL_INTERVAL: 100 },
};

// --- SERVICES (AI LOADER) ---
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
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [videoOn, setVideoOn] = useState(true);
  const [micOn, setMicOn] = useState(false);
  const [sentence, setSentence] = useState([]);
  const [messages, setMessages] = useState([{ text: "Ready to chat. Use gestures.", timestamp: "10:00 AM", isUser: false }]);

  const handleGestureEvent = useCallback((gesture) => {
    if (gesture.type === 'COMMAND') {
      if (gesture.value === 'SEND') {
        if (sentence.length > 0) {
          setMessages(prev => [...prev, { text: sentence.join(' '), timestamp: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}), isUser: true }]);
          setSentence([]);
        }
      } else if (gesture.value === 'BACKSPACE') setSentence(prev => prev.slice(0, -1));
    } else if (gesture.type === 'WORD') setSentence(prev => [...prev, gesture.value]);
  }, [sentence]);

  const { loading, status } = useHandTracking(videoRef, canvasRef, handleGestureEvent);

  useEffect(() => {
    const startCam = async () => {
      if (videoOn) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(CONFIG.CAMERA);
          if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
        } catch(e) { console.error(e); }
      }
    };
    startCam();
  }, [videoOn]);

  return (
    <div style={styles.appContainer}>
      {/* HEADER */}
      <header style={styles.header}>
        <div style={styles.logoGroup}>
          <Activity size={20} color="#3b82f6" />
          <span style={styles.title}>SignNode <span style={styles.badge}>LITE</span></span>
        </div>
        <div style={styles.userGroup}>
          <span style={{ fontSize: '12px', color: '#aaa' }}>Dr. Sarah (Online)</span>
          <div style={styles.avatar}><User size={16} color="white"/></div>
        </div>
      </header>

      {/* MAIN */}
      <div style={styles.main}>
        {/* LEFT: VIDEO */}
        <div style={styles.videoStage}>
          <div style={styles.videoContainer}>
            {loading && <div style={styles.loadingOverlay}>Initializing AI...</div>}
            <video ref={videoRef} style={styles.video} muted playsInline />
            <canvas ref={canvasRef} style={styles.canvas} />
            
            <div style={styles.statusBadge}>
              <div style={{...styles.statusDot, backgroundColor: status === 'No Hand' ? 'red' : '#22c55e'}}></div>
              {status}
            </div>
          </div>

          <div style={styles.controls}>
            <button onClick={() => setVideoOn(!videoOn)} style={styles.btn}>{videoOn ? <Video/> : <Camera/>}</button>
            <button onClick={() => setMicOn(!micOn)} style={styles.btn}>{micOn ? <Mic/> : <MicOff/>}</button>
            <button style={{...styles.btn, backgroundColor: '#dc2626'}}><PhoneOff/></button>
          </div>
        </div>

        {/* RIGHT: CHAT */}
        <div style={styles.chatPanel}>
          <div style={styles.chatHistory}>
            {messages.map((m, i) => (
              <div key={i} style={{...styles.messageRow, alignItems: m.isUser ? 'flex-end' : 'flex-start'}}>
                <div style={{...styles.bubble, backgroundColor: m.isUser ? '#2563eb' : '#374151', borderRadius: m.isUser ? '12px 12px 0 12px' : '12px 12px 12px 0'}}>
                  {m.text}
                </div>
                <span style={styles.timestamp}>{m.timestamp}</span>
              </div>
            ))}
          </div>

          <div style={styles.bufferArea}>
            <div style={styles.bufferHeader}>
              <span>BUFFER</span>
              <span style={{fontSize: '10px', color: '#666'}}>👍 Send | ✊ Delete</span>
            </div>
            <div style={styles.bufferBox}>
              {sentence.length === 0 ? <span style={{color: '#666', fontStyle: 'italic'}}>Gestures appear here...</span> : 
                sentence.map((word, i) => <span key={i} style={styles.wordChip}>{word}</span>)
              }
            </div>
            <div style={styles.manualControls}>
               <button onClick={() => setSentence(prev => prev.slice(0, -1))} style={styles.iconBtn}><Trash2 size={16}/></button>
               <button onClick={() => {/* manual send */}} style={styles.iconBtn}><Send size={16}/></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- STYLES OBJECT (CSS IN JS) ---
const styles = {
  appContainer: { display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#0f1115', color: 'white', fontFamily: 'sans-serif' },
  header: { height: '60px', backgroundColor: '#161920', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px' },
  logoGroup: { display: 'flex', alignItems: 'center', gap: '10px' },
  title: { fontWeight: 'bold', fontSize: '18px' },
  badge: { fontSize: '10px', backgroundColor: '#1e3a8a', color: '#93c5fd', padding: '2px 6px', borderRadius: '10px', marginLeft: '5px' },
  userGroup: { display: 'flex', alignItems: 'center', gap: '15px' },
  avatar: { width: '32px', height: '32px', backgroundColor: '#374151', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  
  main: { flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' },
  
  videoStage: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'black' },
  videoContainer: { position: 'relative', width: '100%', maxWidth: '800px', aspectRatio: '16/9', backgroundColor: '#111', borderRadius: '12px', overflow: 'hidden', border: '1px solid #333' },
  video: { width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' },
  canvas: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' },
  loadingOverlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.8)', color: '#60a5fa' },
  statusBadge: { position: 'absolute', top: '15px', left: '15px', padding: '5px 10px', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', border: '1px solid rgba(255,255,255,0.1)' },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%' },
  
  controls: { marginTop: '20px', display: 'flex', gap: '20px' },
  btn: { padding: '15px', borderRadius: '50%', border: 'none', cursor: 'pointer', backgroundColor: '#374151', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' },
  
  chatPanel: { width: '350px', backgroundColor: '#161920', borderLeft: '1px solid #333', display: 'flex', flexDirection: 'column' },
  chatHistory: { flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' },
  messageRow: { display: 'flex', flexDirection: 'column', maxWidth: '100%' },
  bubble: { padding: '10px 15px', color: 'white', fontSize: '14px', maxWidth: '85%', wordWrap: 'break-word' },
  timestamp: { fontSize: '10px', color: '#6b7280', marginTop: '4px', marginLeft: '5px' },
  
  bufferArea: { padding: '20px', borderTop: '1px solid #333', backgroundColor: '#111318' },
  bufferHeader: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#60a5fa', marginBottom: '10px', fontWeight: 'bold' },
  bufferBox: { minHeight: '60px', backgroundColor: '#0a0a0a', border: '1px solid #333', borderRadius: '8px', padding: '10px', display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '10px' },
  wordChip: { backgroundColor: 'rgba(37, 99, 235, 0.2)', color: '#bfdbfe', padding: '4px 8px', borderRadius: '4px', fontSize: '13px', border: '1px solid rgba(37, 99, 235, 0.3)' },
  manualControls: { display: 'flex', justifyContent: 'flex-end', gap: '10px' },
  iconBtn: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '5px' },
};
