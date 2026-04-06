/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Chat } from './components/Chat';
import { MediaViewer } from './components/MediaViewer';
import { LiveVoice } from './components/LiveVoice';
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from './components/ui/dialog';
import { Button } from './components/ui/button';
import { Mic, MessageCircle, Map as MapIcon, Laptop, Smartphone, Settings2 } from 'lucide-react';
import { cn } from './lib/utils';

export default function App() {
  const [currentMedia, setCurrentMedia] = useState<any>(null);
  const [mobileTab, setMobileTab] = useState<'chat' | 'media'>('chat');
  const [optimizationMode, setOptimizationMode] = useState<'pc' | 'mobile'>('pc');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Auto-detect on first load, but allow manual override
  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setOptimizationMode(isMobile ? 'mobile' : 'pc');
  }, []);

  // Apply dark mode class
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Listen for switch-to-chat event
  useEffect(() => {
    const handleSwitchToChat = () => {
      setMobileTab('chat');
    };
    window.addEventListener('switch-to-chat', handleSwitchToChat);
    return () => window.removeEventListener('switch-to-chat', handleSwitchToChat);
  }, []);

  const isPC = optimizationMode === 'pc';

  return (
    <div className={cn(
      "flex h-[100dvh] w-full bg-white dark:bg-gray-950 overflow-hidden font-sans selection:bg-blue-200 transition-all duration-500",
      isPC ? "flex-row" : "flex-col"
    )}>
      {/* PC Split View */}
      {isPC ? (
        <div className="flex w-full h-full bg-[#F2F2F7] dark:bg-gray-900">
          {/* Left Sidebar (Chat) */}
          <div className="flex w-[400px] h-full flex-col bg-white dark:bg-gray-950 border-r border-[#00000010] dark:border-white/10 shadow-2xl z-10">
            <Chat 
              onMediaGenerated={setCurrentMedia} 
              optimizationMode={optimizationMode}
              setOptimizationMode={setOptimizationMode}
              theme={theme}
              setTheme={setTheme}
            />
          </div>
          
          {/* Main Content Area (Media Viewer) */}
          <div className="flex flex-1 h-full flex-col relative overflow-hidden">
            {/* PC Top Header */}
            <header className="h-16 bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-b border-[#00000010] dark:border-white/10 flex items-center justify-between px-8 shrink-0 z-20">
              <div className="flex items-center gap-4">
                <h1 className="text-xl font-bold tracking-tight text-black dark:text-white">Explore View</h1>
                <div className="h-4 w-px bg-gray-200 dark:bg-gray-800" />
                <p className="text-sm text-gray-500 font-medium">Analyze and generate media in real-time</p>
              </div>
              
              <div className="flex items-center gap-3">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="rounded-full shadow-lg gap-2 bg-[#007AFF] hover:bg-blue-600 px-6 h-10 font-semibold transition-all hover:scale-[1.02] active:scale-95 text-white">
                      <Mic className="w-4 h-4" /> Live Voice
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md rounded-3xl p-0 overflow-hidden border-none shadow-2xl dark:bg-gray-900">
                    <DialogTitle className="sr-only">Live Voice</DialogTitle>
                    <LiveVoice />
                  </DialogContent>
                </Dialog>
              </div>
            </header>
            
            <main className="flex-1 p-8 overflow-hidden">
              <div className="h-full w-full bg-white dark:bg-gray-950 rounded-[40px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.1)] border border-[#00000005] dark:border-white/5 overflow-hidden">
                <MediaViewer currentMedia={currentMedia} />
              </div>
            </main>
          </div>
        </div>
      ) : (
        /* Mobile View */
        <div className="flex flex-col w-full h-full relative bg-white dark:bg-gray-950">
          <div className="flex-1 overflow-hidden">
            {mobileTab === 'chat' ? (
              <Chat 
                onMediaGenerated={(media) => {
                  setCurrentMedia(media);
                  setMobileTab('media');
                }} 
                optimizationMode={optimizationMode}
                setOptimizationMode={setOptimizationMode}
                theme={theme}
                setTheme={setTheme}
              />
            ) : (
              <MediaViewer currentMedia={currentMedia} />
            )}
          </div>

          {/* iOS Bottom Navigation */}
          <div className="pb-safe bg-[#F8F8F8]/90 dark:bg-gray-900/90 backdrop-blur-xl border-t border-[#00000020] dark:border-white/10 flex items-center justify-around px-2 pt-2 shrink-0 z-50">
            <button
              onClick={() => setMobileTab('chat')}
              className={`flex flex-col items-center gap-1 w-16 py-1 ${mobileTab === 'chat' ? 'text-[#007AFF]' : 'text-[#999999] hover:text-gray-600 dark:hover:text-gray-400'}`}
            >
              <MessageCircle className="w-6 h-6" />
              <span className="text-[10px] font-medium">Chat</span>
            </button>
            
            <Dialog>
              <DialogTrigger asChild>
                <button className="flex flex-col items-center gap-1 text-[#999999] hover:text-[#007AFF] -mt-6">
                  <div className="bg-[#007AFF] text-white p-3.5 rounded-full shadow-lg shadow-blue-500/30">
                    <Mic className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-medium text-[#007AFF]">Voice</span>
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md w-[90vw] rounded-3xl p-0 overflow-hidden border-none dark:bg-gray-900">
                <DialogTitle className="sr-only">Live Voice</DialogTitle>
                <LiveVoice />
              </DialogContent>
            </Dialog>

            <button
              onClick={() => setMobileTab('media')}
              className={`flex flex-col items-center gap-1 w-16 py-1 ${mobileTab === 'media' ? 'text-[#007AFF]' : 'text-[#999999] hover:text-gray-600 dark:hover:text-gray-400'}`}
            >
              <MapIcon className="w-6 h-6" />
              <span className="text-[10px] font-medium">Explore</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
