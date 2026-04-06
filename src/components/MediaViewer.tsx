import React, { useState, useEffect, useRef } from 'react';
import { MapPin, ExternalLink, Search, Map as MapIcon, List, MessageCircle, History, X } from 'lucide-react';
import { Button } from './ui/button';
import localforage from 'localforage';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix Leaflet's default icon path issues
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function MapUpdater({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

export function MediaViewer({ currentMedia }: { currentMedia: any }) {
  const [activeTab, setActiveTab] = useState<'map' | 'grounding'>('map');
  const [mapQuery, setMapQuery] = useState('');
  const [activeMapQuery, setActiveMapQuery] = useState('Cebu City Philippines');
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  
  const [mapCenter, setMapCenter] = useState<[number, number]>([10.3157, 123.8854]); // Cebu City
  const [mapZoom, setMapZoom] = useState(13);

  // Load search history
  useEffect(() => {
    localforage.getItem<string[]>('map_search_history').then(saved => {
      if (saved) setSearchHistory(saved);
    });
  }, []);

  // Handle clicks outside to close history dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowHistory(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Geocode activeMapQuery
  useEffect(() => {
    if (activeMapQuery) {
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(activeMapQuery)}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.length > 0) {
            setMapCenter([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
            setMapZoom(13);
          }
        })
        .catch(err => console.error('Geocoding error:', err));
    }
  }, [activeMapQuery]);

  // If new grounding results come in, switch to grounding tab
  useEffect(() => {
    if (currentMedia?.type === 'grounding' && currentMedia.data?.length > 0) {
      setActiveTab('grounding');
      
      // Try to extract a location name from the grounding results to update the map
      const mapResult = currentMedia.data.find((chunk: any) => chunk.maps?.title);
      if (mapResult) {
        setActiveMapQuery(mapResult.maps.title);
      }
    }
  }, [currentMedia]);

  const handleMapSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (mapQuery.trim()) {
      setActiveMapQuery(mapQuery);
      saveToHistory(mapQuery.trim());
      setShowHistory(false);
    }
  };

  const saveToHistory = (query: string) => {
    const newHistory = [query, ...searchHistory.filter(item => item.toLowerCase() !== query.toLowerCase())].slice(0, 10);
    setSearchHistory(newHistory);
    localforage.setItem('map_search_history', newHistory);
  };

  const clearHistory = () => {
    setSearchHistory([]);
    localforage.removeItem('map_search_history');
    setShowHistory(false);
  };

  const handleHistoryClick = (query: string) => {
    setMapQuery(query);
    setActiveMapQuery(query);
    saveToHistory(query);
    setShowHistory(false);
  };

  const handleAskChatbot = () => {
    const query = activeMapQuery || mapQuery || 'this location';
    window.dispatchEvent(new CustomEvent('ask-chatbot', { detail: `Tell me about ${query}` }));
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-950">
      <div className="pt-safe bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-b border-[#00000015] dark:border-white/10 sticky top-0 z-20 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg flex items-center gap-2 tracking-tight text-black dark:text-white">
            <MapPin className="w-5 h-5 text-[#007AFF]" />
            Explore
          </h2>
          
          <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
            <button 
              onClick={() => setActiveTab('map')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-1.5 ${activeTab === 'map' ? 'bg-white dark:bg-gray-700 text-black dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              <MapIcon className="w-4 h-4" /> Map
            </button>
            <button 
              onClick={() => setActiveTab('grounding')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-1.5 ${activeTab === 'grounding' ? 'bg-white dark:bg-gray-700 text-black dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              <List className="w-4 h-4" /> Results
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col relative">
        {activeTab === 'map' && (
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-gray-100 dark:border-white/5 shrink-0 relative" ref={searchContainerRef}>
              <form onSubmit={handleMapSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="text" 
                    value={mapQuery}
                    onChange={(e) => setMapQuery(e.target.value)}
                    onFocus={() => setShowHistory(true)}
                    placeholder="Search map (e.g. Eiffel Tower)..." 
                    className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-900 border-transparent rounded-xl text-sm focus:ring-2 focus:ring-blue-500 dark:text-white outline-none transition-all"
                  />
                  
                  {/* Search History Dropdown */}
                  {showHistory && searchHistory.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-50 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Recent Searches</span>
                        <button 
                          type="button" 
                          onClick={clearHistory}
                          className="text-xs text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400"
                        >
                          Clear
                        </button>
                      </div>
                      <ul className="max-h-60 overflow-y-auto">
                        {searchHistory.map((item, index) => (
                          <li key={index}>
                            <button
                              type="button"
                              onClick={() => handleHistoryClick(item)}
                              className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-3 text-gray-700 dark:text-gray-200"
                            >
                              <History className="w-4 h-4 text-gray-400 shrink-0" />
                              <span className="truncate">{item}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <Button type="submit" className="bg-[#007AFF] hover:bg-blue-600 text-white rounded-xl px-4">
                  Search
                </Button>
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={handleAskChatbot}
                  className="rounded-xl px-4 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-white flex items-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span className="hidden sm:inline">Ask Chatbot</span>
                </Button>
              </form>
            </div>
            <div className="flex-1 w-full relative bg-gray-100 dark:bg-gray-900 z-0">
              <MapContainer 
                center={mapCenter} 
                zoom={mapZoom} 
                className="absolute inset-0 w-full h-full"
                worldCopyJump={false}
                maxBounds={[[-90, -180], [90, 180]]}
                maxBoundsViscosity={1.0}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  noWrap={true}
                  bounds={[[-90, -180], [90, 180]]}
                />
                <Marker position={mapCenter}>
                  <Popup>{activeMapQuery}</Popup>
                </Marker>
                <MapUpdater center={mapCenter} zoom={mapZoom} />
              </MapContainer>
            </div>
          </div>
        )}

        {activeTab === 'grounding' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6">
            {!currentMedia && (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 min-h-[300px]">
                <MapPin className="w-12 h-12 mb-4 opacity-20" />
                <p className="text-[15px]">Search results will appear here.</p>
              </div>
            )}

            {currentMedia?.type === 'grounding' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2 dark:text-white">
                  <List className="w-5 h-5 text-blue-600" /> Grounding Results
                </h3>
                <div className="grid gap-4">
                  {currentMedia.data.map((chunk: any, i: number) => {
                    if (chunk.web) {
                      return (
                        <a key={i} href={chunk.web.uri} target="_blank" rel="noreferrer" className="block p-4 border dark:border-white/10 rounded-lg hover:border-blue-500 dark:hover:border-blue-500 transition-colors bg-gray-50 dark:bg-gray-900">
                          <h4 className="font-medium text-blue-600 flex items-center gap-2">
                            {chunk.web.title} <ExternalLink className="w-3 h-3" />
                          </h4>
                          <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-1">{chunk.web.uri}</p>
                        </a>
                      );
                    }
                    if (chunk.maps) {
                      return (
                        <a key={i} href={chunk.maps.uri} target="_blank" rel="noreferrer" className="block p-4 border dark:border-white/10 rounded-lg hover:border-blue-500 dark:hover:border-blue-500 transition-colors bg-gray-50 dark:bg-gray-900">
                          <h4 className="font-medium text-blue-600 flex items-center gap-2">
                            {chunk.maps.title || 'Map Location'} <ExternalLink className="w-3 h-3" />
                          </h4>
                          <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-1">{chunk.maps.uri}</p>
                        </a>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
