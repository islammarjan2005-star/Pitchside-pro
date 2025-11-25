import React from 'react';
import { VideoAnalyst } from './components/VideoAnalyst';
import { Activity } from 'lucide-react';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 font-sans selection:bg-emerald-500 selection:text-white flex flex-col">
      {/* Professional Header */}
      <header className="bg-[#0f1422] border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
              <Activity className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white leading-none">PitchSide <span className="text-emerald-500">PRO</span></h1>
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Elite Tactical Analysis</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono text-slate-500">
             <span className="bg-slate-900 px-3 py-1 rounded border border-slate-800">ENGINE: GEMINI 3.0 PRO</span>
             <span className="bg-slate-900 px-3 py-1 rounded border border-slate-800">MODE: UEFA PRO LICENSE</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 overflow-hidden">
        <div className="max-w-[1600px] mx-auto h-full">
           <VideoAnalyst />
        </div>
      </main>
    </div>
  );
};

export default App;
