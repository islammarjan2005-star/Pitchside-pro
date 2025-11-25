import React, { useState } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Search, Globe, ExternalLink, Loader2, BookOpen } from 'lucide-react';

const MODEL_NAME = "gemini-2.5-flash";

interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

export const SearchResearch: React.FC = () => {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [sources, setSources] = useState<GroundingChunk[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setResult(null);
    setSources([]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: query,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      setResult(response.text || "No response generated.");
      
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      setSources(chunks as GroundingChunk[]);

    } catch (error: any) {
      console.error(error);
      setResult("Error performing search: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto h-full flex flex-col">
      <div className="text-center mb-8 pt-8">
        <h2 className="text-3xl font-bold text-white mb-3">Live Sports Intelligence</h2>
        <p className="text-slate-400">Powered by Gemini 2.5 Flash & Google Search</p>
      </div>

      {/* Search Input */}
      <form onSubmit={handleSearch} className="relative mb-8">
        <input 
          type="text" 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask about recent match stats, player transfers, or news..."
          className="w-full bg-slate-900/80 border border-slate-700 rounded-2xl py-4 pl-12 pr-4 text-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xl"
        />
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-6 h-6" />
        <button 
          type="submit"
          disabled={isLoading || !query}
          className="absolute right-2 top-2 bottom-2 bg-emerald-500 text-slate-900 px-6 rounded-xl font-bold hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Search'}
        </button>
      </form>

      {/* Results Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
        {result && (
          <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 shadow-lg backdrop-blur-sm">
            <h3 className="text-emerald-450 font-semibold mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              AI Answer
            </h3>
            <div className="prose prose-invert max-w-none text-slate-300 leading-relaxed whitespace-pre-wrap">
              {result}
            </div>
          </div>
        )}

        {sources.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-full text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Sources & Citations
            </div>
            {sources.map((source, idx) => {
              if (!source.web?.uri) return null;
              return (
                <a 
                  key={idx} 
                  href={source.web.uri} 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex items-start gap-3 p-4 bg-slate-900 rounded-lg border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-800 transition-all group"
                >
                  <div className="mt-1 bg-slate-800 p-2 rounded text-emerald-500 group-hover:text-emerald-400">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-slate-200 truncate group-hover:text-emerald-400 transition-colors">
                      {source.web.title || "Web Source"}
                    </h4>
                    <p className="text-xs text-slate-500 truncate mt-1">{source.web.uri}</p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-600 group-hover:text-slate-400" />
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};