import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Mic, MicOff, Loader2, Volume2, FastForward } from 'lucide-react';
import { cn } from '@/src/lib/utils';

const getAI = async () => {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
};

export function LiveVoice() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [voiceName, setVoiceName] = useState<string>("Zephyr");
  const [speechRate, setSpeechRate] = useState<string>("1.0");
  const [transcript, setTranscript] = useState<string[]>([]);
  
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Audio playback queue
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);

  const connect = async () => {
    // Check for API key selection
    if (typeof window !== 'undefined' && (window as any).aistudio) {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await (window as any).aistudio.openSelectKey();
      }
    }

    setIsConnecting(true);
    try {
      const ai = await getAI();
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      
      // We need a simple audio worklet to capture raw PCM data
      // For simplicity in this environment, we'll use ScriptProcessorNode (deprecated but works without separate file)
      // or we can use a base64 encoded worklet. Let's use ScriptProcessor for simplicity if needed, 
      // but actually we can just capture audio using MediaRecorder and send chunks, wait, Live API needs raw PCM.
      // Let's use a simple ScriptProcessorNode for capturing 16kHz PCM.
      
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      sourceNodeRef.current = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
      
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        if (isMuted || !isConnected || !sessionRef.current) return;
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert Float32Array to Int16Array
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcm16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }
        // Convert to base64
        const buffer = new Uint8Array(pcm16.buffer);
        let binary = '';
        for (let i = 0; i < buffer.byteLength; i++) {
          binary += String.fromCharCode(buffer[i]);
        }
        const base64Data = btoa(binary);
        
        sessionRef.current.sendRealtimeInput({
          audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
        });
      };

      sourceNodeRef.current.connect(processor);
      processor.connect(audioContextRef.current.destination);

      const sessionPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setIsConnecting(false);
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              // Decode base64 to PCM
              const binaryString = atob(base64Audio);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const pcm16 = new Int16Array(bytes.buffer);
              const float32 = new Float32Array(pcm16.length);
              for (let i = 0; i < pcm16.length; i++) {
                float32[i] = pcm16[i] / 32768;
              }
              
              playAudioChunk(float32);
            }
            
            if (message.serverContent?.interrupted) {
              audioQueueRef.current = [];
              nextPlayTimeRef.current = audioContextRef.current?.currentTime || 0;
            }
          },
          onclose: () => {
            disconnect();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { 
              prebuiltVoiceConfig: { 
                voiceName: voiceName as any,
              } 
            },
          },
          systemInstruction: "You are a helpful voice assistant for Mapped. Keep responses concise and conversational.",
        },
      });

      sessionRef.current = await sessionPromise;

    } catch (error) {
      console.error('Live API Error:', error);
      setIsConnecting(false);
      disconnect();
    }
  };

  const playAudioChunk = (chunk: Float32Array) => {
    if (!audioContextRef.current) return;
    
    const audioCtx = audioContextRef.current;
    const buffer = audioCtx.createBuffer(1, chunk.length, 24000); // Live API returns 24kHz
    buffer.getChannelData(0).set(chunk);
    
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    
    // Apply speech rate
    const rate = parseFloat(speechRate);
    source.playbackRate.value = rate;
    
    source.connect(audioCtx.destination);
    
    const currentTime = audioCtx.currentTime;
    const duration = buffer.duration / rate;
    
    if (currentTime < nextPlayTimeRef.current) {
      source.start(nextPlayTimeRef.current);
      nextPlayTimeRef.current += duration;
    } else {
      source.start(currentTime);
      nextPlayTimeRef.current = currentTime + duration;
    }
  };

  const disconnect = () => {
    setIsConnected(false);
    setIsConnecting(false);
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-white dark:bg-gray-950 rounded-3xl">
      <div className="mb-8 text-center">
        <h3 className="text-2xl font-semibold tracking-tight text-black dark:text-white mb-2">Live Voice</h3>
        <p className="text-[15px] text-gray-500 dark:text-gray-400">Talk naturally with Mapped</p>
      </div>
      
      <div className="flex items-center gap-6">
        {!isConnected ? (
          <Button 
            onClick={connect} 
            disabled={isConnecting}
            className="rounded-full w-20 h-20 bg-[#007AFF] hover:bg-blue-600 shadow-xl shadow-blue-500/30 transition-transform active:scale-95"
          >
            {isConnecting ? <Loader2 className="w-8 h-8 animate-spin text-white" /> : <Mic className="w-8 h-8 text-white" />}
          </Button>
        ) : (
          <>
            <Button 
              variant={isMuted ? "outline" : "default"}
              onClick={() => setIsMuted(!isMuted)}
              className={cn("rounded-full w-14 h-14 transition-all", isMuted ? "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300" : "bg-[#F2F2F7] dark:bg-gray-800 text-black dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700")}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </Button>
            <Button 
              variant="destructive"
              onClick={disconnect}
              className="rounded-full px-8 h-14 font-semibold text-[15px] bg-[#FF3B30] hover:bg-red-600 shadow-lg shadow-red-500/30"
            >
              End Call
            </Button>
          </>
        )}
      </div>
      
      {isConnected && (
        <div className="mt-8 flex items-center gap-2 text-[15px] text-[#007AFF] font-medium bg-blue-50 px-4 py-2 rounded-full">
          <div className="w-2 h-2 rounded-full bg-[#007AFF] animate-pulse" />
          Listening...
        </div>
      )}

      <div className="mt-12 w-full max-w-md space-y-6 border-t dark:border-white/10 pt-8">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <Volume2 className="w-3 h-3" /> Voice
            </label>
            <Select value={voiceName} onValueChange={setVoiceName} disabled={isConnected || isConnecting}>
              <SelectTrigger className="bg-[#F2F2F7] dark:bg-gray-800 border-none rounded-xl h-11 dark:text-white">
                <SelectValue placeholder="Select Voice" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Zephyr">Zephyr (Default)</SelectItem>
                <SelectItem value="Puck">Puck</SelectItem>
                <SelectItem value="Charon">Charon</SelectItem>
                <SelectItem value="Kore">Kore</SelectItem>
                <SelectItem value="Fenrir">Fenrir</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <FastForward className="w-3 h-3" /> Speed
            </label>
            <Select value={speechRate} onValueChange={setSpeechRate} disabled={isConnected || isConnecting}>
              <SelectTrigger className="bg-[#F2F2F7] dark:bg-gray-800 border-none rounded-xl h-11 dark:text-white">
                <SelectValue placeholder="Speed" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0.5">0.5x</SelectItem>
                <SelectItem value="0.75">0.75x</SelectItem>
                <SelectItem value="1.0">1.0x (Normal)</SelectItem>
                <SelectItem value="1.25">1.25x</SelectItem>
                <SelectItem value="1.5">1.5x</SelectItem>
                <SelectItem value="2.0">2.0x</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {(isConnected || isConnecting) && (
          <p className="text-[11px] text-center text-gray-400 italic">
            Disconnect to change voice settings
          </p>
        )}
      </div>
    </div>
  );
}
