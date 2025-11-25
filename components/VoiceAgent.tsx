import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, Volume2, XCircle, Activity } from 'lucide-react';
import { createPcmBlob, decodeAudioData, b64ToUint8Array } from '../utils/audio';

const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';

export const VoiceAgent: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<string>("Ready to connect");
  const [volume, setVolume] = useState(0); // For visualization
  
  // Refs for audio handling to avoid re-renders
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputNodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<any>(null); // To store the session object

  const stopSession = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (inputNodeRef.current) {
      inputNodeRef.current.disconnect();
      inputNodeRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsActive(false);
    setStatus("Disconnected");
    setVolume(0);
  };

  const startSession = async () => {
    try {
      setStatus("Initializing audio...");
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass({ sampleRate: 24000 }); // Output rate
      audioContextRef.current = audioCtx;
      
      // Input Audio Context (16kHz required for Gemini)
      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStatus("Connecting to Gemini Live...");

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Setup Connection
      const sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction: "You are a helpful, energetic sports commentator and assistant. Keep responses concise.",
        },
        callbacks: {
          onopen: () => {
            setStatus("Live");
            setIsActive(true);
            
            // Setup Microphone Stream
            const source = inputCtx.createMediaStreamSource(stream);
            sourceNodeRef.current = source;
            
            // Buffer size 4096, 1 input channel, 1 output channel
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            inputNodeRef.current = processor;

            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              // Simple volume calculation for visualizer
              let sum = 0;
              for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
              setVolume(Math.sqrt(sum / inputData.length));

              const pcmBlob = createPcmBlob(inputData);
              sessionPromise.then(session => {
                  session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(processor);
            processor.connect(inputCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
               // Decode and play
               if (!audioContextRef.current) return;
               
               const ctx = audioContextRef.current;
               nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
               
               const audioBuffer = await decodeAudioData(
                 b64ToUint8Array(audioData), 
                 ctx
               );
               
               const source = ctx.createBufferSource();
               source.buffer = audioBuffer;
               source.connect(ctx.destination);
               source.start(nextStartTimeRef.current);
               nextStartTimeRef.current += audioBuffer.duration;
            }
          },
          onclose: () => {
            setStatus("Disconnected");
            setIsActive(false);
          },
          onerror: (err) => {
            console.error(err);
            setStatus("Error occurred");
            stopSession();
          }
        }
      });

      // Save session ref to close later
      sessionPromise.then(sess => {
          sessionRef.current = sess;
      });

    } catch (e: any) {
      console.error(e);
      setStatus(`Error: ${e.message}`);
      stopSession();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSession();
    };
  }, []);

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center space-y-8 max-w-md w-full">
        <div className="relative">
          <div className={`w-32 h-32 mx-auto rounded-full flex items-center justify-center transition-all duration-300 border-4 
            ${isActive ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_30px_rgba(16,185,129,0.3)]' : 'border-slate-700 bg-slate-800'}`}>
            
            {isActive ? (
               // Visualizer bars
               <div className="flex items-center justify-center gap-1 h-12">
                 {[1, 2, 3, 4, 5].map((i) => (
                   <div 
                     key={i}
                     className="w-1.5 bg-emerald-500 rounded-full transition-all duration-75"
                     style={{ 
                       height: `${Math.max(10, Math.min(40, volume * 500 * (Math.random() + 0.5)))}px` 
                     }}
                   />
                 ))}
               </div>
            ) : (
              <MicOff className="w-12 h-12 text-slate-500" />
            )}
          </div>
          
          {isActive && (
            <div className="absolute -top-2 -right-2">
              <span className="flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500"></span>
              </span>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-2">PitchSide Voice</h2>
          <p className="text-slate-400 min-h-[1.5em]">{status}</p>
        </div>

        <button
          onClick={isActive ? stopSession : startSession}
          className={`
            w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all
            ${isActive 
              ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/50' 
              : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-lg hover:shadow-emerald-500/20'}
          `}
        >
          {isActive ? (
            <>
              <XCircle className="w-6 h-6" /> End Session
            </>
          ) : (
            <>
              <Mic className="w-6 h-6" /> Start Conversation
            </>
          )}
        </button>

        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800 text-sm text-slate-500 text-left">
          <p className="flex items-center gap-2 mb-2">
            <Volume2 className="w-4 h-4" /> 
            <span className="font-semibold">Instructions:</span>
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Use headphones for best audio quality.</li>
            <li>Ask about recent football rules or tactical concepts.</li>
            <li>Click "Start" and allow microphone access.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};