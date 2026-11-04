import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Send,
  Radio,
  RotateCcw,
  Play,
  Square,
  Plane,
  Copy,
  Check,
  Sparkles,
  MessageSquare,
  Headphones,
  ChevronDown,
  Settings2,
  Activity,
  CheckCircle2,
  Zap,
  ArrowRight
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import {
  synthesizeSpeech,
  createSpeechRecognizer,
  queryVayuBrain,
  VOICE_SPEAKERS
} from '../../services/voiceAgentService';
import GlassCard from '../common/GlassCard';

export default function TacticalCopilotView() {
  const { isDark, activeTab } = useTheme();

  // Mode: 'orb' (Gemini Live / ChatGPT Voice Mode) vs 'chat' (Vanna Assist Feed)
  const [viewMode, setViewMode] = useState('orb');
  const [selectedSpeaker, setSelectedSpeaker] = useState('shubh');
  const [isContinuousLive, setIsContinuousLive] = useState(true);

  const [inputQuery, setInputQuery] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // Live transcript state for the Voice Orb
  const [liveTranscript, setLiveTranscript] = useState('');
  const [lastAgentSpoken, setLastAgentSpoken] = useState(
    'Jai Hind, Commander. Tactical flight line communications are online. Thirteen combat aircraft are mission ready, and tail SB-024 is on maintenance hold at Thanjavur. Awaiting your flight directive.'
  );

  const initialGreetingMessage = {
    id: 'init-1',
    sender: 'agent',
    time: 'Just now',
    text: `I am the Air Power Copilot, your tactical flight line guide for the Indian Air Force predictive maintenance platform. I monitor frontline combat airframe readiness, 5-stage gas path digital twins, conformal RUL thresholds, and forward depot supply chains.

Explaining fleet capabilities:
I can diagnose conservative RUL safety bounds, inspect forward base spares inventory, and evaluate sortie clearance feasibility across our 20 frontline airframes.`,
    formulaCard: {
      title: "Fleet Availability Standard",
      formula: "Mission Ready (13) / Total Airframes (20) = 65.0% (MoD Target: 75.0%)"
    },
    spokenText: 'Jai Hind, Commander. Tactical flight line communications are online. Thirteen combat aircraft are mission ready, and tail SB-024 is on maintenance hold at Thanjavur. Awaiting your flight directive.',
    suggestions: [
      'Give me a sortie clearance briefing',
      'Why is tail SB-024 grounded at AFS Thanjavur?',
      'Explain the 5-stage thermodynamic turbofan twin',
      'How does conformal RUL calculation work?'
    ]
  };

  const [messages, setMessages] = useState([initialGreetingMessage]);
  const [currentAudio, setCurrentAudio] = useState(null);

  const messagesEndRef = useRef(null);
  const recognizerRef = useRef(null);
  const isContinuousLiveRef = useRef(isContinuousLive);

  useEffect(() => {
    isContinuousLiveRef.current = isContinuousLive;
  }, [isContinuousLive]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, viewMode]);

  // Speech Recognition initialization
  useEffect(() => {
    const recognizer = createSpeechRecognizer({
      onResult: (transcript, isFinal) => {
        setLiveTranscript(transcript);
        setInputQuery(transcript);
        if (isFinal && transcript.trim()) {
          handleSendMessage(transcript.trim());
          setIsListening(false);
        }
      },
      onError: (err) => {
        console.warn('Speech recognition error:', err);
        setIsListening(false);
      },
      onEnd: () => {
        setIsListening(false);
      }
    });
    recognizerRef.current = recognizer;
  }, [selectedSpeaker]);

  const stopAudio = () => {
    if (currentAudio) {
      currentAudio.pause();
      if (currentAudio.currentTime) currentAudio.currentTime = 0;
      setCurrentAudio(null);
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingAudio(false);
  };

  const startListening = () => {
    stopAudio();
    if (!recognizerRef.current) {
      alert('Speech recognition is not supported in this browser. Please type your message.');
      return;
    }
    try {
      setLiveTranscript('');
      recognizerRef.current.start();
      setIsListening(true);
    } catch (e) {
      console.warn('Recognition start error:', e);
    }
  };

  const stopListening = () => {
    if (recognizerRef.current && isListening) {
      recognizerRef.current.stop();
      setIsListening(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // Play audio via Sarvam AI bulbul:v3 with automatic continuous loop
  const playVoice = async (text) => {
    stopAudio();
    setIsPlayingAudio(true);
    setLastAgentSpoken(text);

    try {
      const audioInstance = await synthesizeSpeech(text, {
        speaker: selectedSpeaker,
      });
      setCurrentAudio(audioInstance);

      if (audioInstance.play) {
        audioInstance.onended = () => {
          setIsPlayingAudio(false);
          // CONTINUOUS GEMINI LIVE / CHATGPT VOICE LOOP:
          // If in continuous mode and in Voice Orb view, automatically start listening for user's reply!
          if (isContinuousLiveRef.current) {
            setTimeout(() => {
              startListening();
            }, 400);
          }
        };

        audioInstance.onerror = () => setIsPlayingAudio(false);
        const playPromise = audioInstance.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => setIsPlayingAudio(false));
        }
      } else {
        setIsPlayingAudio(false);
      }
    } catch (err) {
      console.error('Sarvam Audio playback error:', err);
      setIsPlayingAudio(false);
    }
  };

  const handleSendMessage = async (textToSend) => {
    const query = (textToSend || inputQuery).trim();
    if (!query) return;

    stopAudio();
    stopListening();
    setIsThinking(true);

    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: query
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');

    // Generate military intelligence response
    setTimeout(async () => {
      setIsThinking(false);
      const response = queryVayuBrain(query, { activeTab });
      const agentMsg = {
        id: `agent-${Date.now()}`,
        sender: 'agent',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: response.displayText,
        formulaCard: response.formulaCard,
        spokenText: response.spokenText,
        suggestions: response.suggestions
      };

      setMessages((prev) => [...prev, agentMsg]);

      // Automatically speak the briefing with Sarvam AI voice
      if (response.spokenText) {
        playVoice(response.spokenText);
      }
    }, 200);
  };

  const handleCopy = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleNewChat = () => {
    stopAudio();
    stopListening();
    setLiveTranscript('');
    setMessages([initialGreetingMessage]);
    setLastAgentSpoken(initialGreetingMessage.spokenText);
  };

  const quickPrompts = [
    { label: 'Sortie Clearance Briefing', prompt: 'Give me a sortie clearance briefing' },
    { label: 'Why is SB-024 Grounded?', prompt: 'Why is tail SB-024 grounded at AFS Thanjavur?' },
    { label: '5 Stage Engine Telemetry', prompt: 'Explain the 5-stage thermodynamic turbofan twin' },
    { label: 'Conformal RUL Calculation', prompt: 'How does conformal RUL calculation work?' },
    { label: 'Spares & Depot Logistics', prompt: 'What is the status of base spares and central depot logistics?' },
    { label: 'Pilot Snag Log Fusion', prompt: 'Explain the multi-modal NLP snag-to-sensor fusion' },
  ];

  // Helper to cleanly parse and render inline text
  const formatInline = (text) => {
    if (!text) return null;
    const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\$[^\$]+\$)/g);
    return tokens.map((token, i) => {
      if (token.startsWith('**') && token.endsWith('**')) {
        return (
          <strong key={i} className={`font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {token.slice(2, -2)}
          </strong>
        );
      }
      if (token.startsWith('`') && token.endsWith('`')) {
        return (
          <code key={i} className="font-mono text-[11px] px-1 py-0.5 rounded bg-cyan-950/40 text-cyan-400 border border-cyan-500/20">
            {token.slice(1, -1)}
          </code>
        );
      }
      if (token.startsWith('$') && token.endsWith('$')) {
        return (
          <span key={i} className="font-mono text-[11px] font-semibold text-cyan-400 bg-cyan-950/20 px-1 py-0.2 rounded">
            {token.slice(1, -1)}
          </span>
        );
      }
      return token;
    });
  };

  // Structured message line formatter matching Vanna Assist typography
  const renderFormattedText = (text) => {
    if (!text) return null;
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      const trimmed = line.trim();

      if (trimmed.startsWith('### ')) {
        return (
          <h4 key={idx} className={`font-bold text-xs uppercase tracking-wider mt-3 mb-1.5 ${isDark ? 'text-cyan-300' : 'text-blue-700'}`}>
            {trimmed.replace('### ', '')}
          </h4>
        );
      }

      if (trimmed.startsWith('• ') || trimmed.startsWith('- ')) {
        const content = trimmed.replace(/^[•\-]\s+/, '');
        return (
          <div key={idx} className={`flex items-start gap-2 text-xs sm:text-[13px] my-1.5 pl-0.5 leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 shrink-0" />
            <div className="flex-1">{formatInline(content)}</div>
          </div>
        );
      }

      if (!trimmed) return <div key={idx} className="h-1.5" />;

      if (trimmed.endsWith(':')) {
        return (
          <p key={idx} className={`font-semibold text-xs sm:text-[13px] mt-2.5 mb-1 ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
            {trimmed}
          </p>
        );
      }

      return (
        <p key={idx} className={`text-xs sm:text-[13px] my-1 leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
          {formatInline(line)}
        </p>
      );
    });
  };

  return (
    <div className="space-y-6 pb-12 animate-fadeIn">
      {/* 1. TOP HEADER & OPERATIONAL CONTROLS */}
      <GlassCard className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-blue-700 border border-blue-500/30 flex items-center justify-center text-white shadow-sm shrink-0">
            <Plane className="w-6 h-6 -rotate-45" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-sans px-2.5 py-0.5 rounded-full font-semibold border ${
                isDark ? 'bg-blue-500/10 text-sky-400 border-blue-500/20' : 'bg-blue-50 text-blue-800 border-blue-300 font-bold'
              }`}>
                Sarvam AI bulbul:v3 Voice Link
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Voice Channel Active" />
            </div>
            <h2 className={`text-lg sm:text-xl font-extrabold tracking-tight mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Tactical Voice Copilot & Flight Line Assistant
            </h2>
          </div>
        </div>

        {/* Action Controls: Mode Switch, Speaker Selector, Hands Free Toggle, New Chat */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Mode Switch: Live Voice Orb vs Chat Feed */}
          <div className={`p-1 rounded-xl border flex items-center gap-1 ${
            isDark ? 'bg-slate-900/90 border-white/10' : 'bg-slate-100 border-slate-200'
          }`}>
            <button
              onClick={() => setViewMode('orb')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'orb'
                  ? 'bg-blue-700 text-white border border-blue-500/30 shadow-sm'
                  : isDark
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-700 hover:text-slate-900 font-semibold'
              }`}
            >
              <Headphones className="w-3.5 h-3.5" />
              <span>Live Voice (Gemini Style)</span>
            </button>
            <button
              onClick={() => setViewMode('chat')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'chat'
                  ? 'bg-blue-700 text-white border border-blue-500/30 shadow-sm'
                  : isDark
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-700 hover:text-slate-900 font-semibold'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Chat & Dossier</span>
            </button>
          </div>

          {/* Speaker Selector */}
          <div className="relative">
            <select
              value={selectedSpeaker}
              onChange={(e) => setSelectedSpeaker(e.target.value)}
              className={`text-xs font-semibold py-2 px-3 pr-8 rounded-xl appearance-none cursor-pointer border transition ${
                isDark
                  ? 'bg-slate-900/90 text-cyan-300 border-white/15 hover:border-cyan-500/40'
                  : 'bg-white text-slate-800 border-slate-200 hover:border-blue-400'
              }`}
            >
              {VOICE_SPEAKERS.map((sp) => (
                <option key={sp.id} value={sp.id} className="bg-slate-900 text-white">
                  {sp.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
          </div>

          {/* Hands Free Continuous Voice Loop Toggle */}
          <button
            onClick={() => setIsContinuousLive(!isContinuousLive)}
            title="When active, the assistant automatically listens for your reply after speaking (hands-free like ChatGPT / Gemini)"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition ${
              isContinuousLive
                ? isDark
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-sm'
                  : 'bg-emerald-100 border-emerald-300 text-emerald-900 font-bold shadow-2xs'
                : isDark
                ? 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                : 'bg-slate-100 border-slate-300 text-slate-700 hover:text-slate-900 font-medium'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isContinuousLive ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
            <span>Hands Free Loop</span>
          </button>

          {/* New Chat Button */}
          <button
            onClick={handleNewChat}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition ${
              isDark
                ? 'border-white/10 hover:bg-white/10 text-slate-300 hover:text-white'
                : 'border-slate-300 hover:bg-slate-100 text-slate-800 font-medium'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      </GlassCard>

      {/* 2. MAIN VIEW AREA (GEMINI LIVE ORB OR VANNA CHAT) */}
      {viewMode === 'orb' ? (
        /* ========================================================= */
        /* GEMINI LIVE / CHATGPT VOICE INTERACTIVE ORB VIEW          */
        /* ========================================================= */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Visualizer Canvas (2 Cols) */}
          <GlassCard className="p-6 sm:p-10 lg:col-span-2 flex flex-col items-center justify-between min-h-[500px] relative overflow-hidden">
            {/* Background Tactical Radar Sweep Effect */}
            <div className="absolute inset-0 pointer-events-none opacity-20 flex items-center justify-center">
              <div className="w-[420px] h-[420px] rounded-full border border-cyan-500/20 animate-ping" style={{ animationDuration: '4s' }} />
              <div className="w-[300px] h-[300px] rounded-full border border-blue-500/30" />
              <div className="w-[180px] h-[180px] rounded-full border border-cyan-400/40" />
            </div>

            {/* Top Status Banner */}
            <div className="z-10 text-center">
              <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs backdrop-blur-md shadow-2xs ${isDark ? "bg-slate-900/80 border-white/10 text-slate-300" : "bg-slate-100 border-slate-300 text-slate-800 font-bold"}`}>

                <span className={`w-2 h-2 rounded-full ${
                  isListening
                    ? 'bg-red-500 animate-ping'
                    : isPlayingAudio
                    ? 'bg-cyan-400 animate-pulse'
                    : 'bg-emerald-400'
                }`} />
                <span className="font-semibold">
                  {isListening
                    ? 'Listening to microphone...'
                    : isPlayingAudio
                    ? 'Transmitting via Sarvam bulbul:v3...'
                    : isThinking
                    ? 'Synthesizing tactical intelligence...'
                    : 'Tactical Voice Channel Ready'}
                </span>
              </div>
            </div>

            {/* Central Glowing Interactive Voice Orb */}
            <div className="my-8 z-10 flex flex-col items-center justify-center">
              <div className="relative flex items-center justify-center">
                {/* Outer Glow Halo */}
                <div
                  className={`absolute rounded-full filter blur-2xl transition-all duration-700 ${
                    isListening
                      ? 'w-64 h-64 bg-red-500/25 animate-pulse'
                      : isPlayingAudio
                      ? 'w-72 h-72 bg-blue-500/25 animate-pulse'
                      : 'w-52 h-52 bg-blue-500/10'
                  }`}
                />

                {/* Interactive Clickable Orb Button */}
                <button
                  onClick={toggleListening}
                  className={`relative w-40 h-40 sm:w-48 sm:h-48 rounded-full flex flex-col items-center justify-center transition-all duration-500 cursor-pointer shadow-xl ${
                    isListening
                      ? 'bg-slate-900 border-2 border-red-500 shadow-md ring-4 ring-red-500/20'
                      : isPlayingAudio
                      ? 'bg-slate-900 border-2 border-blue-500 shadow-md ring-4 ring-blue-500/20 animate-pulse'
                      : isDark
                      ? 'bg-slate-900 border border-slate-700 hover:border-blue-500'
                      : 'bg-white border border-slate-300 text-slate-800 hover:border-blue-600 shadow-md'
                  }`}
                  title={isListening ? 'Click to Stop Listening' : 'Click Orb to Speak'}
                >
                  {isListening ? (
                    <>
                      <Mic className="w-12 h-12 text-red-400 animate-bounce" />
                      <span className="text-[11px] font-bold text-red-400 tracking-widest uppercase mt-2">
                        Listening...
                      </span>
                    </>
                  ) : isPlayingAudio ? (
                    <>
                      <Volume2 className="w-12 h-12 text-blue-400 animate-pulse" />
                      <span className="text-[11px] font-bold text-sky-400 tracking-widest uppercase mt-2">
                        Speaking...
                      </span>
                    </>
                  ) : (
                    <>
                      <Mic className={`w-10 h-10 group-hover:scale-110 transition ${isDark ? "text-slate-400" : "text-blue-700"}`} />
                      <span className={`text-[11px] font-bold tracking-wider uppercase mt-2 ${isDark ? "text-slate-300" : "text-slate-900 font-black"}`}>
                        Tap to Talk
                      </span>
                    </>
                  )}
                </button>
              </div>

              {/* Real-time Frequency Equalizer Waves */}
              <div className="flex items-center gap-1.5 h-6 mt-6">
                {[5, 12, 18, 9, 24, 16, 8, 20, 14, 22, 10, 6].map((h, i) => (
                  <span
                    key={i}
                    style={{
                      height: isPlayingAudio || isListening ? `${h}px` : '4px',
                      animationDelay: `${i * 0.08}s`
                    }}
                    className={`w-1.5 rounded-full transition-all duration-300 ${
                      isListening
                        ? 'bg-red-400 animate-bounce'
                        : isPlayingAudio
                        ? 'bg-blue-500 animate-bounce'
                        : (isDark ? 'bg-slate-700' : 'bg-slate-300')
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Bottom Live Speech Readout */}
            <div className="z-10 w-full max-w-xl text-center px-4">
              {liveTranscript ? (
                <div className={`p-3.5 rounded-xl border font-sans text-sm animate-fadeIn ${
                  isDark ? 'bg-slate-900/90 border-cyan-500/30 text-white' : 'bg-blue-50 border-blue-200 text-slate-900 shadow-sm'
                }`}>
                  <span className={`font-bold uppercase text-[10px] block mb-0.5 ${isDark ? 'text-cyan-400' : 'text-blue-700 font-bold'}`}>You said:</span>
                  "{liveTranscript}"
                </div>
              ) : (
                <div className={`p-3.5 rounded-xl border text-xs font-sans leading-relaxed ${
                  isDark ? 'bg-slate-900/70 border-white/5 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-800 shadow-2xs'
                }`}>
                  <span className={`font-bold uppercase text-[10px] block mb-0.5 ${isDark ? 'text-cyan-400' : 'text-blue-700 font-bold'}`}>Last Briefing Transmitted:</span>
                  "{lastAgentSpoken.slice(0, 180)}..."
                </div>
              )}
            </div>
          </GlassCard>

          {/* Right Rail: Quick Directives & Operational Telemetry (1 Col) */}
          <div className="space-y-4">
            <GlassCard className="p-5">
              <h3 className={`font-bold text-sm tracking-tight mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Flight Line Quick Directives
              </h3>
              <p className={`text-xs mb-3 ${isDark ? "text-slate-400" : "text-slate-600 font-medium"}`}>
                Tap any directive to immediately trigger the live spoken voice briefing:
              </p>

              <div className="space-y-2">
                {quickPrompts.map((qp, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(qp.prompt)}
                    className={`w-full text-left p-3 rounded-xl border text-xs font-medium transition-all flex items-center justify-between group ${
                      isDark
                        ? 'bg-slate-900/70 hover:bg-cyan-500/10 border-white/5 hover:border-cyan-500/30 text-slate-300 hover:text-white'
                        : 'bg-slate-50 hover:bg-blue-50 border-slate-200 hover:border-blue-300 text-slate-800 font-medium hover:text-blue-900 shadow-2xs'
                    }`}
                  >
                    <span>{qp.label}</span>
                    <ArrowRight className={`w-3.5 h-3.5 ${isDark ? "text-slate-500 group-hover:text-cyan-400" : "text-slate-400 group-hover:text-blue-600"} group-hover:translate-x-0.5 transition`} />
                  </button>
                ))}
              </div>
            </GlassCard>

            <GlassCard className="p-4 flex items-center justify-between text-xs font-sans">
              <div>
                <p className={`font-bold ${isDark ? "text-slate-300" : "text-slate-900 font-bold"}`}>Continuous Hands Free Mode</p>
                <p className={`text-[11px] mt-0.5 ${isDark ? "text-slate-500" : "text-slate-600 font-medium"}`}>Talk freely without pressing mic each time</p>
              </div>
              <button
                onClick={() => setIsContinuousLive(!isContinuousLive)}
                className={`w-11 h-6 rounded-full transition-colors p-1 ${isContinuousLive ? 'bg-cyan-500' : (isDark ? 'bg-slate-700' : 'bg-slate-300')}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${isContinuousLive ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </GlassCard>
          </div>
        </div>
      ) : (
        /* ========================================================= */
        /* CHAT & TELEMETRY FEED VIEW (VANNA ASSIST ARCHITECTURE)    */
        /* ========================================================= */
        <GlassCard className="p-4 sm:p-6 min-h-[600px] flex flex-col justify-between">
          {/* Scrollable Message Feed */}
          <div className="flex-1 overflow-y-auto space-y-6 max-h-[580px] pr-2 font-sans">
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';

              if (isUser) {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-xs sm:text-sm bg-blue-700 text-white shadow-sm leading-relaxed border border-blue-600/30">
                      {msg.text}
                    </div>
                  </div>
                );
              }

              return (
                <div key={msg.id} className="flex items-start gap-3.5">
                  <div className="w-7 h-7 rounded-xl bg-blue-700 border border-blue-500/30 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-sm">
                    <Plane className="w-4 h-4 -rotate-45" />
                  </div>

                  <div className="flex-1 min-w-0 max-w-[92%]">
                    <div className="space-y-1">
                      {renderFormattedText(msg.text)}
                    </div>

                    {/* Formula Card */}
                    {msg.formulaCard && (
                      <div className={`my-3 p-3.5 rounded-xl border transition-all ${
                        isDark
                          ? 'bg-slate-900/80 border-white/10'
                          : 'bg-slate-50 border-slate-200'
                      }`}>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-sans mb-1">
                          {msg.formulaCard.title || 'Formula'}
                        </p>
                        <p className={`text-xs sm:text-[13px] font-mono font-semibold ${
                          isDark ? 'text-cyan-300' : 'text-blue-700'
                        }`}>
                          {msg.formulaCard.formula}
                        </p>
                      </div>
                    )}

                    {/* Action Bar: Copy & Listen Aloud */}
                    <div className="flex items-center gap-3.5 mt-2.5 text-xs text-slate-400 font-sans">
                      <button
                        onClick={() => handleCopy(msg.text, msg.id)}
                        className="flex items-center gap-1 hover:text-slate-200 transition py-1"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400 font-medium">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>

                      {msg.spokenText && (
                        <button
                          onClick={() => playVoice(msg.spokenText)}
                          className={`flex items-center gap-1 transition py-1 font-semibold ${
                            isDark ? 'text-cyan-400 hover:text-cyan-300' : 'text-blue-600 hover:text-blue-700'
                          }`}
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Listen Aloud (Sarvam Voice)</span>
                        </button>
                      )}
                    </div>

                    {/* Keep going Suggestions */}
                    {msg.suggestions && msg.suggestions.length > 0 && (
                      <div className={`mt-4 pt-3.5 border-t ${isDark ? 'border-white/10' : 'border-slate-100'}`}>
                        <p className={`text-xs font-semibold mb-2 font-sans ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                          Keep going
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {msg.suggestions.map((suggestion, sIdx) => (
                            <button
                              key={sIdx}
                              onClick={() => handleSendMessage(suggestion)}
                              className={`text-left px-3.5 py-2.5 rounded-xl text-xs border transition-all duration-200 font-medium leading-snug flex items-center justify-between gap-2 ${
                                isDark
                                  ? 'bg-slate-900/60 hover:bg-cyan-500/10 border-white/10 hover:border-cyan-500/30 text-slate-300 hover:text-cyan-200'
                                  : 'bg-slate-50 hover:bg-blue-50 border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700'
                              }`}
                            >
                              <span>{suggestion}</span>
                              <ArrowRight className="w-3 h-3 shrink-0 opacity-50" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Floating Bar */}
          <div className="mt-4 pt-3 border-t border-white/10">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className={`flex items-center gap-2 p-1.5 pl-3 rounded-2xl border transition-all ${
                isDark
                  ? 'bg-slate-900/90 border-white/10 focus-within:border-cyan-500/50 shadow-inner'
                  : 'bg-slate-50 border-slate-200 focus-within:border-blue-400 shadow-sm'
              }`}
            >
              <button
                type="button"
                onClick={toggleListening}
                className={`p-2 rounded-xl flex items-center justify-center transition-all ${
                  isListening
                    ? 'bg-red-500 text-white animate-pulse shadow-md'
                    : isDark
                    ? 'text-slate-400 hover:text-cyan-400 hover:bg-white/5'
                    : 'text-slate-500 hover:text-blue-600 hover:bg-slate-200/60'
                }`}
                title={isListening ? 'Stop Listening' : 'Speak via Microphone'}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <input
                type="text"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                placeholder="Ask about fleet readiness, RUL, engine twin, tail SB-024..."
                className={`flex-1 bg-transparent text-xs sm:text-sm focus:outline-none px-1 ${
                  isDark ? 'text-white placeholder-slate-500' : 'text-slate-800 placeholder-slate-400'
                }`}
              />

              <button
                type="submit"
                disabled={!inputQuery.trim()}
                className="w-9 h-9 rounded-xl bg-blue-700 hover:bg-blue-600 border border-blue-500/40 text-white disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all shadow-sm active:scale-95 shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
