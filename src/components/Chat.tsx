import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { Send, Mic, Image as ImageIcon, Map as MapIcon, Globe, Settings, Volume2, Video, Clock, ExternalLink, Navigation, Sun, Moon, Laptop, Smartphone, Settings2, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from './ui/dialog';
import Markdown from 'react-markdown';
import { cn } from '@/src/lib/utils';
import localforage from 'localforage';
import { motion, AnimatePresence } from 'motion/react';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type Message = {
  id: string;
  role: 'user' | 'model';
  text: string;
  media?: { type: 'image' | 'video'; url: string; mimeType: string; data: string };
  grounding?: any;
};

interface ChatProps {
  onMediaGenerated: (media: any) => void;
  optimizationMode?: 'pc' | 'mobile';
  setOptimizationMode?: (mode: 'pc' | 'mobile') => void;
  theme?: 'light' | 'dark';
  setTheme?: (theme: 'light' | 'dark') => void;
}

export function Chat({ onMediaGenerated, optimizationMode = 'pc', setOptimizationMode, theme = 'light', setTheme }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [highThinking, setHighThinking] = useState(false);
  const [groundingMode, setGroundingMode] = useState<'none' | 'search' | 'maps'>('none');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<{ file: File; data: string } | null>(null);
  const [locationSearchInput, setLocationSearchInput] = useState('');
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => console.error('Geolocation error:', error)
      );
    }
  }, []);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    localforage.getItem<Message[]>('chat_history').then(saved => {
      if (saved && saved.length > 0) {
        setMessages(saved);
      }
    });
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      localforage.setItem('chat_history', messages);
    }
  }, [messages]);

  useEffect(() => {
    const handleAskChatbot = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setInput(customEvent.detail);
        // Switch to mobile chat tab if on mobile
        if (optimizationMode === 'mobile' && setOptimizationMode) {
          // We can't directly change mobileTab from here easily without lifting state,
          // but we can dispatch another event to let App.tsx know to switch tabs
          window.dispatchEvent(new CustomEvent('switch-to-chat'));
        }
      }
    };
    window.addEventListener('ask-chatbot', handleAskChatbot);
    return () => window.removeEventListener('ask-chatbot', handleAskChatbot);
  }, [optimizationMode, setOptimizationMode]);

  const clearHistory = () => {
    setMessages([]);
    localforage.removeItem('chat_history');
  };

  const handleLocationSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!locationSearchInput.trim() || isSearchingLocation) return;

    setIsSearchingLocation(true);
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Search for the following location: ${locationSearchInput}`,
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: userLocation ? {
            retrievalConfig: {
              latLng: {
                latitude: userLocation.lat,
                longitude: userLocation.lng
              }
            }
          } : undefined
        }
      });

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) {
        onMediaGenerated({ type: 'grounding', data: chunks });
      } else {
        onMediaGenerated({ type: 'grounding', data: [] });
      }
      
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'user',
        text: `📍 Searched for location: ${locationSearchInput}`
      }]);
      
      setLocationSearchInput('');
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (error) {
      console.error('Location Search Error:', error);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: 'Sorry, I encountered an error searching for that location.' }]);
    } finally {
      setIsSearchingLocation(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          try {
            setIsLoading(true);
            const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: [
                {
                  parts: [
                    { text: 'Transcribe this audio exactly as spoken.' },
                    { inlineData: { data: base64Audio, mimeType: 'audio/webm' } }
                  ]
                }
              ]
            });
            if (response.text) {
              setInput(prev => prev + (prev ? ' ' : '') + response.text);
            }
          } catch (error) {
            console.error('Transcription Error:', error);
          } finally {
            setIsLoading(false);
          }
        };
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedMedia({ file, data: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const playTTS = async (text: string) => {
    if (!ttsEnabled) return;
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
        audio.play();
      }
    } catch (error) {
      console.error('TTS Error:', error);
    }
  };

  const handleSend = async () => {
    if (!input.trim() && !selectedMedia) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      media: selectedMedia ? {
        type: selectedMedia.file.type.startsWith('image') ? 'image' : 'video',
        url: selectedMedia.data,
        mimeType: selectedMedia.file.type,
        data: selectedMedia.data.split(',')[1]
      } : undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSelectedMedia(null);
    setIsLoading(true);
    setTimeout(scrollToBottom, 100);

    try {
      let model = highThinking ? 'gemini-3.1-pro-preview' : 'gemini-3.1-flash-lite-preview';
      if (groundingMode !== 'none' && !highThinking) {
        model = 'gemini-3-flash-preview';
      }
      if (userMessage.media) {
        model = 'gemini-3.1-pro-preview';
      }
      const parts: any[] = [{ text: userMessage.text }];
      
      if (userMessage.media) {
        parts.push({
          inlineData: {
            data: userMessage.media.data,
            mimeType: userMessage.media.mimeType
          }
        });
      }

      const config: any = {
        systemInstruction: "You are Mapped, an AI assistant that helps users explore the world. You can search the web, find places on maps, and analyze images/videos. Be helpful and concise.",
      };

      if (highThinking) {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
      }

      if (groundingMode === 'search') {
        config.tools = [{ googleSearch: {} }];
      } else if (groundingMode === 'maps') {
        config.tools = [{ googleMaps: {} }];
        if (userLocation) {
          config.toolConfig = {
            retrievalConfig: {
              latLng: {
                latitude: userLocation.lat,
                longitude: userLocation.lng
              }
            }
          };
        }
      }

      // Convert previous messages to contents format for history
      const contents = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));
      contents.push({ role: 'user', parts });

      const response = await ai.models.generateContent({
        model,
        contents,
        config
      });

      const responseText = response.text || '';
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;

      const modelMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        grounding: groundingChunks
      };

      setMessages(prev => [...prev, modelMessage]);
      if (ttsEnabled) {
        playTTS(responseText);
      }

    } catch (error) {
      console.error('Chat Error:', error);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: 'Sorry, I encountered an error.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#F2F2F7] dark:bg-gray-900 md:border-r dark:border-white/10">
      <div className="pt-safe bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-b border-[#00000015] dark:border-white/10 flex items-center justify-between px-4 py-3 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-lg flex items-center gap-2 tracking-tight text-black dark:text-white">
            <Globe className="w-5 h-5 text-[#007AFF]" />
            Mapped
          </h2>
          
          {/* Theme Toggle */}
          {setTheme && (
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Moon className="w-4 h-4 text-gray-400" /> : <Sun className="w-4 h-4 text-gray-600" />}
            </Button>
          )}

          {/* Optimization Toggle */}
          {setOptimizationMode && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                  <Settings2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[300px] rounded-3xl p-6 dark:bg-gray-900 dark:text-white border-none shadow-2xl">
                <DialogTitle className="text-lg font-bold mb-4">Device Optimization</DialogTitle>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setOptimizationMode('pc')}
                    className={cn(
                      "flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all",
                      optimizationMode === 'pc' ? "border-[#007AFF] bg-blue-50 dark:bg-blue-900/20 text-[#007AFF]" : "border-transparent bg-gray-50 dark:bg-gray-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                    )}
                  >
                    <Laptop className="w-8 h-8" />
                    <span className="text-xs font-bold uppercase tracking-wider">PC</span>
                  </button>
                  <button
                    onClick={() => setOptimizationMode('mobile')}
                    className={cn(
                      "flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all",
                      optimizationMode === 'mobile' ? "border-[#007AFF] bg-blue-50 dark:bg-blue-900/20 text-[#007AFF]" : "border-transparent bg-gray-50 dark:bg-gray-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                    )}
                  >
                    <Smartphone className="w-8 h-8" />
                    <span className="text-xs font-bold uppercase tracking-wider">Mobile</span>
                  </button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearHistory} className="text-xs text-gray-500 hover:text-red-500 h-8 px-2">
              Clear
            </Button>
          )}
          <div className="flex items-center gap-2 bg-[#E9E9EB] dark:bg-gray-800 px-3 py-1.5 rounded-full" title="Text-to-Speech">
            <Volume2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            <Switch checked={ttsEnabled} onCheckedChange={setTtsEnabled} className="scale-75 origin-right" />
          </div>
        </div>
      </div>

      {/* Location Search Bar */}
      <div className="px-4 py-3 bg-white dark:bg-gray-950 border-b border-[#00000015] dark:border-white/10 shrink-0">
        <form onSubmit={handleLocationSearch} className="flex items-center gap-2 bg-[#F2F2F7] dark:bg-gray-900 rounded-xl p-1 border border-[#00000010] dark:border-white/10">
          <MapIcon className="w-5 h-5 text-gray-400 ml-2 shrink-0" />
          <input
            type="text"
            value={locationSearchInput}
            onChange={(e) => setLocationSearchInput(e.target.value)}
            placeholder="Search locations..."
            className="flex-1 bg-transparent border-none focus:ring-0 text-[15px] py-1.5 px-1 dark:text-white dark:placeholder-gray-500 outline-none"
          />
          <Button 
            type="submit" 
            disabled={isSearchingLocation || !locationSearchInput.trim()}
            size="sm"
            className="rounded-lg bg-[#007AFF] hover:bg-blue-600 text-white h-8 px-3"
          >
            {isSearchingLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
          </Button>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence initial={false}>
          {messages.map(msg => (
            <motion.div 
              key={msg.id} 
              initial={{ opacity: 0, y: 15, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4, type: "spring", bounce: 0.3 }}
              className={cn("flex flex-col max-w-[85%]", msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start")}
            >
              <div className={cn("px-4 py-2.5 text-[15px] leading-relaxed shadow-sm", msg.role === 'user' ? "bg-[#007AFF] text-white rounded-2xl rounded-br-[4px]" : "bg-white dark:bg-gray-800 text-black dark:text-white rounded-2xl rounded-bl-[4px] border border-[#00000010] dark:border-white/5")}>
                {msg.media && (
                  <div className="mb-2">
                    {msg.media.type === 'image' ? (
                      <img src={msg.media.url} alt="Uploaded" className="max-w-full h-auto rounded-lg max-h-48 object-contain" />
                    ) : (
                      <video src={msg.media.url} controls className="max-w-full h-auto rounded-lg max-h-48" />
                    )}
                  </div>
                )}
                <div className="markdown-body">
                  <Markdown>{msg.text}</Markdown>
                </div>
                {msg.grounding && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                      {msg.grounding.some((c: any) => c.maps) ? <MapIcon className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                      {msg.grounding.some((c: any) => c.maps) ? 'Map Results' : 'Search Results'}
                    </div>
                    <div className="grid gap-2">
                      {msg.grounding.map((chunk: any, i: number) => {
                        if (chunk.web) {
                          return (
                            <a key={i} href={chunk.web.uri} target="_blank" rel="noreferrer" className="flex items-start gap-3 p-3 bg-[#F2F2F7] dark:bg-gray-900 rounded-xl hover:bg-[#E5E5EA] dark:hover:bg-gray-800 transition-colors group">
                              <div className="w-8 h-8 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center shrink-0 shadow-sm">
                                <Globe className="w-4 h-4 text-blue-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-semibold text-black dark:text-white truncate group-hover:text-blue-600 transition-colors">{chunk.web.title}</h4>
                                <p className="text-[10px] text-gray-500 truncate">{chunk.web.uri}</p>
                              </div>
                              <ExternalLink className="w-3 h-3 text-gray-400 group-hover:text-blue-500" />
                            </a>
                          );
                        }
                        if (chunk.maps) {
                          return (
                            <a key={i} href={chunk.maps.uri} target="_blank" rel="noreferrer" className="flex items-start gap-3 p-3 bg-[#F2F2F7] dark:bg-gray-900 rounded-xl hover:bg-[#E5E5EA] dark:hover:bg-gray-800 transition-colors group">
                              <div className="w-8 h-8 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center shrink-0 shadow-sm">
                                <MapIcon className="w-4 h-4 text-red-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-semibold text-black dark:text-white truncate group-hover:text-red-600 transition-colors">{chunk.maps.title || 'Map Location'}</h4>
                                <p className="text-[10px] text-gray-500 truncate">View on Google Maps</p>
                              </div>
                              <Navigation className="w-3 h-3 text-gray-400 group-hover:text-red-500" />
                            </a>
                          );
                        }
                        return null;
                      })}
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="mt-2 text-[11px] text-blue-600 hover:bg-blue-50 w-full justify-center h-8"
                      onClick={() => onMediaGenerated({ type: 'grounding', data: msg.grounding })}
                    >
                      Open in Explore View
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
          {isLoading && (
            <motion.div 
              key="loading"
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              transition={{ duration: 0.3 }}
              className="mr-auto items-start flex max-w-[85%]"
            >
              <div className="p-3 rounded-2xl bg-white dark:bg-gray-800 border dark:border-white/5 text-gray-500 dark:text-gray-400 text-sm flex items-center gap-2 shadow-sm">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 pb-safe bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-t border-[#00000015] dark:border-white/10 z-20">
        <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider shrink-0">Grounding</span>
          <div className="flex bg-[#E9E9EB] dark:bg-gray-800 rounded-full p-0.5 shrink-0">
            <button
              onClick={() => setGroundingMode('none')}
              className={cn("px-3 py-1 text-xs rounded-full transition-all", groundingMode === 'none' ? "bg-white dark:bg-gray-600 shadow-sm font-medium text-black dark:text-white" : "text-gray-500 dark:text-gray-400")}
            >
              None
            </button>
            <button
              onClick={() => setGroundingMode('search')}
              className={cn("px-3 py-1 text-xs rounded-full transition-all flex items-center gap-1", groundingMode === 'search' ? "bg-white dark:bg-gray-600 shadow-sm font-medium text-black dark:text-white" : "text-gray-500 dark:text-gray-400")}
            >
              <Globe className="w-3 h-3" /> Search
            </button>
            <button
              onClick={() => setGroundingMode('maps')}
              className={cn("px-3 py-1 text-xs rounded-full transition-all flex items-center gap-1", groundingMode === 'maps' ? "bg-white dark:bg-gray-600 shadow-sm font-medium text-black dark:text-white" : "text-gray-500 dark:text-gray-400")}
            >
              <MapIcon className="w-3 h-3" /> Maps
            </button>
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0 bg-[#E9E9EB] dark:bg-gray-800 rounded-full p-0.5 pl-3">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Pro</span>
            <Switch checked={highThinking} onCheckedChange={setHighThinking} className="scale-75 origin-right" />
          </div>
        </div>

        {selectedMedia && (
          <div className="mb-3 relative inline-block">
            {selectedMedia.file.type.startsWith('image') ? (
              <img src={selectedMedia.data} alt="Preview" className="h-16 w-16 object-cover rounded-xl shadow-sm border border-gray-200 dark:border-gray-700" />
            ) : (
              <video src={selectedMedia.data} className="h-16 w-16 object-cover rounded-xl shadow-sm border border-gray-200 dark:border-gray-700" />
            )}
            <button onClick={() => setSelectedMedia(null)} className="absolute -top-2 -right-2 bg-gray-800 dark:bg-gray-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-md border-2 border-white dark:border-gray-900">×</button>
          </div>
        )}

        <div className="flex gap-2 items-end bg-[#F2F2F7] dark:bg-gray-900 rounded-3xl p-1 border border-[#00000010] dark:border-white/10">
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*" onChange={handleFileSelect} />
          <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} className="shrink-0 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 h-9 w-9">
            <ImageIcon className="w-5 h-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={isRecording ? stopRecording : startRecording} 
            className={cn("shrink-0 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 h-9 w-9", isRecording ? "text-red-500 animate-pulse bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50" : "text-gray-500")}
          >
            <Mic className="w-5 h-5" />
          </Button>
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Message Mapped..."
            className="min-h-[36px] max-h-32 resize-none py-2 px-1 bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none text-[15px] dark:text-white dark:placeholder-gray-400"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button 
            onClick={handleSend} 
            disabled={isLoading || (!input.trim() && !selectedMedia)} 
            className="shrink-0 rounded-full h-9 w-9 p-0 bg-[#007AFF] hover:bg-blue-600 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
