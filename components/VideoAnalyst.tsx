
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Activity, CheckCircle, AlertCircle, 
  ChevronRight, BarChart2, Loader2, Upload, 
  Video as VideoIcon, BrainCircuit, TrendingUp, Shield, Target,
  PenTool, RefreshCw, Wifi, WifiOff, CloudUpload, Play, Clock,
  Users, Move, Eye, Footprints, ClipboardList, Cone, Camera, Image as ImageIcon,
  Maximize2
} from 'lucide-react';
import { AnalysisData, VideoEvent, TacticalInsight } from '../types';

// Limit set to 2GB. 
// Note: Browser stability for >500MB depends on available RAM.
const MAX_FILE_SIZE_MB = 2000; 
const ANALYSIS_MODEL_NAME = "gemini-3-pro-preview";
const VISUAL_MODEL_NAME = "gemini-2.5-flash-image";

// Helper for exponential backoff
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper for Manual REST Upload (Resumable Protocol)
const uploadFileToGemini = async (file: File, apiKey: string, onProgress?: (percent: number) => void): Promise<{name: string, uri: string}> => {
  const metadata = { file: { display_name: file.name } };
  
  // 1. Start Resumable Upload Session
  const startUpload = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': file.size.toString(),
        'X-Goog-Upload-Header-Content-Type': file.type,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!startUpload.ok) {
    const errText = await startUpload.text();
    throw new Error(`Upload init failed (${startUpload.status}): ${errText}`);
  }
  
  const uploadUrl = startUpload.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error("No upload URL returned from Google.");

  // 2. Upload Bytes (Using PUT is often more robust for large binary payloads in Google APIs)
  const uploadBytes = await fetch(uploadUrl, {
    method: 'PUT', 
    headers: {
      'Content-Length': file.size.toString(),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: file, // Fetch handles streaming the File object automatically in modern browsers
  });

  if (!uploadBytes.ok) {
    const errText = await uploadBytes.text();
    throw new Error(`Upload bytes failed (${uploadBytes.status}): ${errText}`);
  }

  const uploadResult = await uploadBytes.json();
  return { name: uploadResult.file.name, uri: uploadResult.file.uri };
};

const getFileState = async (fileName: string, apiKey: string): Promise<string> => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`
  );
  if (!response.ok) return "UNKNOWN";
  const data = await response.json();
  return data.state;
};

// --- Sub-Component: Insight Card with Visuals ---
const InsightCard: React.FC<{
  insight: TacticalInsight;
  videoRef: React.RefObject<HTMLVideoElement>;
  apiKey: string;
}> = ({ insight, videoRef, apiKey }) => {
  const [frameImage, setFrameImage] = useState<string | null>(null);
  const [generatedDiagram, setGeneratedDiagram] = useState<string | null>(null);
  const [isGeneratingDiagram, setIsGeneratingDiagram] = useState(false);

  const captureFrame = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    
    // If insight has a specific time, seek to it first (if needed), 
    // but typically user might want to capture *current* frame or the frame at the timestamp.
    // For smoothness, we assume the user might have clicked the card to jump to time.
    // Let's force jump if we are not close.
    if (insight.key_moment_seconds && Math.abs(video.currentTime - insight.key_moment_seconds) > 1) {
       video.currentTime = insight.key_moment_seconds;
       // We need to wait for seek to complete to capture frame? 
       // Often instantaneous for local blobs, but let's just capture immediately 
       // or user can click again.
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth / 2; // Scale down slightly for performance
      canvas.height = video.videoHeight / 2;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      setFrameImage(canvas.toDataURL('image/jpeg', 0.8));
    } catch (e) {
      console.error("Frame capture failed", e);
    }
  };

  const generateTacticalBoard = async () => {
    if (!apiKey) return;
    setIsGeneratingDiagram(true);
    try {
       const ai = new GoogleGenAI({ apiKey });
       const prompt = `
         Create a high-quality, professional 2D tactical football board diagram (top-down view) on a green pitch.
         Visual Style: Schematic, clean coaching board, flat design.
         
         Scenario to depict based on analysis: 
         ${insight.drill_setup || insight.visual_cue}
         
         Requirements:
         - Show Team A (Red) and Team B (Blue) positions clearly as circles.
         - Use arrows for player movement (solid) and ball movement (dashed).
         - Highlight the key space or zone mentioned in the insight.
         - Aspect Ratio: 16:9.
       `;
       
       const response = await ai.models.generateContent({
         model: VISUAL_MODEL_NAME,
         contents: prompt,
         config: {
           imageConfig: {
             aspectRatio: "16:9" // Nano banana supports 16:9
           }
         }
       });

       // Extract image from response
       // Note: Gemini 2.5 Flash Image returns parts.
       let foundImage = false;
       const parts = response.candidates?.[0]?.content?.parts;
       if (parts) {
         for (const part of parts) {
           if (part.inlineData && part.inlineData.data) {
             setGeneratedDiagram(`data:image/png;base64,${part.inlineData.data}`);
             foundImage = true;
             break;
           }
         }
       }
    } catch (e) {
      console.error("Diagram generation failed", e);
    } finally {
      setIsGeneratingDiagram(false);
    }
  };

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden shadow-sm hover:border-slate-700 transition-colors">
      <div className="bg-slate-900/80 px-4 py-3 border-b border-slate-800 flex justify-between items-center">
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-purple-400" />
            {insight.title}
          </h3>
          <div className="flex items-center gap-2">
            {insight.key_moment_timestamp && (
               <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                 {insight.key_moment_timestamp}
               </span>
            )}
            <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-950 px-2 py-1 rounded border border-slate-800">
              {insight.phase}
            </span>
          </div>
      </div>
      
      <div className="p-4 space-y-4">
        {/* Text Content */}
        <div className="grid grid-cols-1 gap-4">
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-wider">Tactical Observation</p>
            <p className="text-sm text-slate-300 leading-relaxed border-l-2 border-slate-700 pl-3">
              {insight.observation}
            </p>
          </div>

          <div className="bg-emerald-500/5 rounded-lg p-3 border border-emerald-500/20">
              <div className="flex items-center gap-2 mb-2 text-emerald-500">
                <PenTool className="w-3 h-3" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Coaching Point</span>
              </div>
              <p className="text-sm text-slate-200 leading-relaxed">
                {insight.improvement}
              </p>
          </div>
        </div>

        {/* Visuals Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            
            {/* 1. Literal Frame Screenshot */}
            <div className="flex flex-col gap-2">
               <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Evidence Frame</span>
                  <button 
                    onClick={captureFrame}
                    className="text-[10px] bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded flex items-center gap-1 transition-colors border border-slate-700"
                    title="Capture current video frame"
                  >
                    <Camera className="w-3 h-3" /> Snap
                  </button>
               </div>
               <div className="aspect-video bg-black rounded border border-slate-800 relative group overflow-hidden">
                  {frameImage ? (
                    <img src={frameImage} alt="Frame" className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600">
                       <span className="text-xs">No Frame Captured</span>
                    </div>
                  )}
                  {insight.key_moment_seconds && (
                    <button 
                      onClick={() => {
                        if (videoRef.current && insight.key_moment_seconds) {
                          videoRef.current.currentTime = insight.key_moment_seconds;
                          videoRef.current.play();
                        }
                      }}
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                       <Play className="w-8 h-8 text-white" />
                    </button>
                  )}
               </div>
            </div>

            {/* 2. AI Generated Diagram */}
            <div className="flex flex-col gap-2">
               <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Tactical Board</span>
                  <button 
                    onClick={generateTacticalBoard}
                    disabled={isGeneratingDiagram || !!generatedDiagram}
                    className="text-[10px] bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-400 px-2 py-1 rounded flex items-center gap-1 transition-colors border border-emerald-900/50 disabled:opacity-50"
                  >
                    {isGeneratingDiagram ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
                    {generatedDiagram ? "Generated" : "Generate Visual"}
                  </button>
               </div>
               <div className="aspect-video bg-[#1a472a] rounded border border-slate-800 relative overflow-hidden flex items-center justify-center">
                  {isGeneratingDiagram ? (
                    <div className="text-center">
                      <Loader2 className="w-6 h-6 animate-spin text-emerald-300 mx-auto mb-1" />
                      <span className="text-[10px] text-emerald-200">Drawing Tactics...</span>
                    </div>
                  ) : generatedDiagram ? (
                    <img src={generatedDiagram} alt="Tactical Board" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-emerald-900/40">
                       <Cone className="w-12 h-12 opacity-50" />
                    </div>
                  )}
               </div>
            </div>

        </div>

        {/* Drill Info if available */}
        {insight.drill_name && (
          <div className="bg-blue-500/5 rounded-lg p-3 border border-blue-500/20 mt-2">
              <div className="flex items-center gap-2 mb-2 text-blue-400">
                <ClipboardList className="w-3 h-3" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Suggested Drill: {insight.drill_name}</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {insight.drill_setup}
              </p>
          </div>
        )}
      </div>
    </div>
  );
};


export const VideoAnalyst: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [rawResponse, setRawResponse] = useState<string>("");
  const [showDebug, setShowDebug] = useState(false);
  const [activeTab, setActiveTab] = useState<'events' | 'tactics' | 'players'>('events');
  
  // Progress State
  const [progress, setProgress] = useState(0);
  const [loadingStage, setLoadingStage] = useState("Initializing...");
  const [retryCount, setRetryCount] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const apiKey = process.env.API_KEY || "";

  // Simulated Progress Effect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isAnalyzing) {
      setProgress(0);
      
      interval = setInterval(() => {
        setProgress(prev => {
          if (retryCount > 0) return 90;
          if (prev >= 90) return 90;
          const increment = prev < 30 ? 2.5 : prev < 60 ? 1.5 : 0.5;
          return Math.min(prev + increment, 90);
        });
      }, 400);
    } else {
      setProgress(100);
    }
    return () => clearInterval(interval);
  }, [isAnalyzing, retryCount]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setError(`File too large (${(selectedFile.size / 1024 / 1024).toFixed(1)}MB).`);
        setErrorDetails(`The limit is ${MAX_FILE_SIZE_MB}MB.`);
        return;
      }
      setFile(selectedFile);
      setVideoUrl(URL.createObjectURL(selectedFile));
      setAnalysisData(null);
      setRawResponse("");
      setError(null);
      setErrorDetails(null);
    }
  };

  const fileToBase64 = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const tryParseJSON = (text: string): any => {
    try { return JSON.parse(text); } catch (e) {}
    // Strip markdown code blocks
    const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (markdownMatch) { try { return JSON.parse(markdownMatch[1]); } catch (e) {} }
    // Find generic JSON-like structure
    const firstOpenBrace = text.indexOf('{');
    const lastCloseBrace = text.lastIndexOf('}');
    if (firstOpenBrace !== -1 && lastCloseBrace !== -1) {
      try { return JSON.parse(text.substring(firstOpenBrace, lastCloseBrace + 1)); } catch (e) {}
    }
    throw new Error("Could not parse JSON from response.");
  };

  const runAnalysis = async () => {
    if (!file) return;
    if (!apiKey) {
      setError("API Key Missing");
      setErrorDetails("process.env.API_KEY is not set.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setErrorDetails(null);
    setRawResponse("");
    setAnalysisData(null);
    setRetryCount(0);
    setLoadingStage("Preparing video...");

    const ai = new GoogleGenAI({ apiKey });
    
    // Strategy: 
    // < 20MB: Use Inline (Fast, no upload wait)
    // > 20MB: Use File API via REST (Upload -> Process -> Analyze)
    const isLargeFile = file.size > 20 * 1024 * 1024;
    
    let contentPart: any = null;

    try {
      if (isLargeFile) {
        setLoadingStage("Uploading to Secure Storage...");
        const { name: fileName, uri: fileUri } = await uploadFileToGemini(file, apiKey);
        
        setLoadingStage("Processing video content...");
        let fileState = "PROCESSING";
        while (fileState === "PROCESSING") {
          await sleep(2000);
          fileState = await getFileState(fileName, apiKey);
          if (fileState === "FAILED") throw new Error("Video processing failed on server.");
        }

        if (fileState !== "ACTIVE") throw new Error(`File state is ${fileState}`);
        contentPart = { fileData: { mimeType: file.type, fileUri: fileUri } };

      } else {
        setLoadingStage("Encoding video (Inline)...");
        const base64Data = await fileToBase64(file);
        contentPart = { inlineData: { mimeType: file.type, data: base64Data } };
      }

      setLoadingStage("Analyzing movements & structure...");

      const prompt = `
        Role: You are an Elite UEFA Pro License Football Analyst.
        Task: Analyze this video clip with EXTREME precision.
        
        CRITICAL RULES ON CERTAINTY:
        1. NO HALLUCINATIONS: If the video is blurry, cuts off, or the ball is not visible, DO NOT invent events.
        2. GOALS: Only mark "Goal" if you explicitly see the ball cross the line or the referee signal it.
        3. FORMATIONS: Only state formation (e.g., 4-3-3) if clear. Otherwise "Dynamic/Unclear".
        
        ANALYSIS REQUIREMENTS:
        1. Match Events: Key actions with timestamps.
        2. Player Analysis: Focus on individual off-ball movement, decoy runs, defensive tracking, and pressing intensity. Identify players by number or position.
        3. Tactical Insights: Team shape, spacing, and specific coaching improvements.
        
        For "Tactical Insights", you MUST include:
        - improvement: A direct tactical adjustment for the match.
        - drill_name: A specific training drill name to practice this scenario.
        - drill_setup: Brief instructions on how to set up this drill.
        - visual_cue: Detailed visual description of the scenario for a tactical board diagram (e.g. "Red team in 4-4-2 block, Blue #10 receiving in half-space, arrows showing press").
        - key_moment_timestamp: The specific MM:SS where this tactic is most visible (for frame capturing).
        - key_moment_seconds: The integer seconds for the above timestamp.
        
        Return JSON matching this schema:
        {
          "match_context": "string (or 'Unknown')",
          "formations": { "team_a": "string", "team_b": "string" },
          "events": [{ "timestamp": "MM:SS", "seconds": number, "type": "string", "team": "string", "description": "string" }],
          "player_analysis": [
             { 
               "player": "string (e.g. 'No. 9' or 'Right Winger')", 
               "action_type": "Off-Ball Run | Decoy | Defensive Tracking | Pressing | Playmaking",
               "description": "string",
               "impact": "High | Medium | Low",
               "time_start": "MM:SS"
             }
          ],
          "tactical_insights": [{ 
             "title": "string", 
             "phase": "string", 
             "observation": "string", 
             "improvement": "Direct tactical adjustment for the players.", 
             "drill_name": "Specific training drill name",
             "drill_setup": "Brief setup description for the coach",
             "visual_cue": "Detailed visual description for diagram generation.",
             "key_moment_timestamp": "MM:SS",
             "key_moment_seconds": number
          }]
        }
      `;

      const MAX_RETRIES = 3;
      let attempt = 0;
      let success = false;
      let responseText = "";

      while (attempt < MAX_RETRIES && !success) {
          try {
              if (attempt > 0) {
                setLoadingStage(`Retrying analysis (Attempt ${attempt + 1}/${MAX_RETRIES})...`);
                setRetryCount(attempt);
              }

              const response = await ai.models.generateContent({
                  model: ANALYSIS_MODEL_NAME,
                  contents: [
                    {
                      parts: [
                        contentPart,
                        { text: prompt }
                      ]
                    }
                  ],
                  config: {
                    thinkingConfig: { thinkingBudget: 2048 },
                    maxOutputTokens: 12000,
                  }
              });
              responseText = response.text || "";
              success = true;
          } catch (err: any) {
              console.warn(`Attempt ${attempt + 1} failed:`, err);
              const isRetryable = err.status === 503 || err.code === 503 || 
                                  err.status === 429 || err.code === 429 ||
                                  err.message?.includes('overloaded') || err.message?.includes('fetch');

              if (isRetryable && attempt < MAX_RETRIES - 1) {
                  attempt++;
                  const delay = Math.pow(2, attempt) * 2000;
                  await sleep(delay);
              } else {
                  throw err;
              }
          }
      }

      setRawResponse(responseText);
      if (!responseText) throw new Error("Empty response from AI.");

      const json = tryParseJSON(responseText);
      setAnalysisData(json);
      
      if (json.player_analysis?.length > 0) setActiveTab('players');
      else if (json.tactical_insights?.length > 0) setActiveTab('tactics');

    } catch (err: any) {
      console.error("Analysis Error", err);
      setError("Analysis Failed");
      setErrorDetails(err.message || JSON.stringify(err));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const jumpToTime = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play();
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'Goal': return '#10b981'; // emerald-500
      case 'Shot': return '#3b82f6'; // blue-500
      case 'Defense': return '#f97316'; // orange-500
      case 'Tactical': return '#a855f7'; // purple-500
      case 'Transition': return '#eab308'; // yellow-500
      default: return '#94a3b8'; // slate-400
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'Goal': return <Target className="text-emerald-500" />;
      case 'Shot': return <Activity className="text-blue-500" />;
      case 'Defense': return <Shield className="text-orange-500" />;
      case 'Tactical': return <BrainCircuit className="text-purple-500" />;
      case 'Transition': return <TrendingUp className="text-yellow-500" />;
      default: return <ChevronRight className="text-slate-400" />;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)]">
      
      {/* Left Column: Video & Controls (7/12) */}
      <div className="lg:col-span-7 flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar pr-2">
        {/* Player */}
        <div className="bg-black rounded-xl overflow-hidden shadow-2xl border border-slate-800 aspect-video relative group shrink-0">
          {videoUrl ? (
            <video 
              ref={videoRef}
              src={videoUrl} 
              className="w-full h-full object-contain"
              controls
              playsInline
              crossOrigin="anonymous" 
              onLoadedMetadata={(e) => setVideoDuration(e.currentTarget.duration)}
              onTimeUpdate={(e) => setCurrentVideoTime(e.currentTarget.currentTime)}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 bg-[#0f1422]">
              <VideoIcon className="w-16 h-16 mb-4 opacity-30" />
              <p className="font-mono text-sm">UPLOAD MATCH FOOTAGE</p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="bg-[#0f1422] p-6 rounded-xl border border-slate-800">
          <div className="flex flex-col gap-4">
            
            <div className="flex items-center gap-4 text-xs font-mono mb-2">
               <div className={`flex items-center gap-2 ${apiKey ? 'text-emerald-500' : 'text-red-500'}`}>
                 {apiKey ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                 <span>API: {apiKey ? "CONNECTED" : "MISSING"}</span>
               </div>
               <div className="text-slate-500">|</div>
               <div className="text-slate-500">ANALYSIS: {ANALYSIS_MODEL_NAME}</div>
               <div className="text-slate-500">|</div>
               <div className="text-slate-500">VISUALS: {VISUAL_MODEL_NAME}</div>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex-1 cursor-pointer">
                <input 
                  type="file" 
                  accept="video/mp4,video/quicktime,video/webm"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="bg-slate-900 border border-slate-700 hover:border-emerald-500/50 rounded-lg p-3 text-sm text-slate-400 flex items-center justify-between transition-colors">
                  <span className="truncate">{file ? file.name : "Select Video File"}</span>
                  <Upload className="w-4 h-4" />
                </div>
              </label>
              
              <button 
                onClick={runAnalysis}
                disabled={!file || isAnalyzing}
                className={`
                  px-6 py-3 rounded-lg font-bold shadow-lg transition-all flex items-center gap-2 whitespace-nowrap text-sm
                  ${!file || isAnalyzing 
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                    : 'bg-emerald-600 text-white hover:bg-emerald-500 hover:shadow-emerald-500/20'}
                `}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {retryCount > 0 ? `RETRYING (${retryCount})...` : "ANALYZING..."}
                  </>
                ) : (
                  <>
                    <BrainCircuit className="w-4 h-4" />
                    RUN EXPERT ANALYSIS
                  </>
                )}
              </button>
            </div>

            {file && file.size > 20 * 1024 * 1024 && !isAnalyzing && (
              <div className="text-xs text-yellow-500 flex items-center gap-2">
                 <CloudUpload className="w-3 h-3" />
                 Large file detected. Uploading to Gemini storage for processing (may take longer).
              </div>
            )}
            
            {error && (
              <div className="p-4 bg-red-950/30 border border-red-500/30 text-red-400 rounded-lg text-sm">
                <div className="flex items-center gap-2 font-bold mb-1">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
                {errorDetails && (
                   <p className="text-xs font-mono opacity-80 pl-6 break-all">
                     {errorDetails}
                   </p>
                )}
                <div className="mt-3 pl-6 flex gap-3">
                  <button onClick={runAnalysis} className="underline text-xs flex items-center gap-1 hover:text-white">
                    <RefreshCw className="w-3 h-3" /> Try Again
                  </button>
                  {rawResponse && (
                    <button onClick={() => setShowDebug(!showDebug)} className="underline text-xs hover:text-white">
                       {showDebug ? "Hide Debug" : "Show Raw Response"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {analysisData && (
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="bg-slate-900/50 p-3 rounded border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Team A Formation</span>
                  <span className="text-emerald-400 font-mono text-sm">{analysisData.formations?.team_a || "Unknown"}</span>
                </div>
                <div className="bg-slate-900/50 p-3 rounded border border-slate-800">
                  <span className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Team B Formation</span>
                  <span className="text-emerald-400 font-mono text-sm">{analysisData.formations?.team_b || "Unknown"}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Analysis Dashboard (5/12) */}
      <div className="lg:col-span-5 flex flex-col h-full bg-[#0f1422] rounded-xl border border-slate-800 overflow-hidden shadow-2xl">
        {/* Tabs */}
        <div className="flex border-b border-slate-800">
          <button 
            onClick={() => setActiveTab('events')}
            className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors
              ${activeTab === 'events' ? 'bg-slate-800/80 text-emerald-400 border-b-2 border-emerald-500' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900/50'}
            `}
          >
            <Activity className="w-3.5 h-3.5" /> Timeline
          </button>
          <button 
            onClick={() => setActiveTab('players')}
            className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors
              ${activeTab === 'players' ? 'bg-slate-800/80 text-emerald-400 border-b-2 border-emerald-500' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900/50'}
            `}
          >
            <Users className="w-3.5 h-3.5" /> Players
          </button>
          <button 
            onClick={() => setActiveTab('tactics')}
            className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors
              ${activeTab === 'tactics' ? 'bg-slate-800/80 text-emerald-400 border-b-2 border-emerald-500' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900/50'}
            `}
          >
            <BrainCircuit className="w-3.5 h-3.5" /> Tactics
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden relative">
          {showDebug && (
            <div className="absolute inset-0 z-50 bg-slate-950 p-4 overflow-auto border-t border-slate-800">
              <button onClick={() => setShowDebug(false)} className="mb-2 text-xs text-red-400 underline sticky top-0 bg-slate-950 w-full text-left py-1">Close Debug View</button>
              <pre className="text-xs font-mono text-emerald-500 whitespace-pre-wrap">{rawResponse}</pre>
            </div>
          )}

          <div className="absolute inset-0 overflow-y-auto custom-scrollbar p-0">
            {!analysisData && !isAnalyzing && (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 text-center p-8">
                <BarChart2 className="w-16 h-16 mb-6 opacity-20" />
                <p className="text-sm font-medium text-slate-500">Run analysis to generate expert insights</p>
                <p className="text-xs text-slate-600 mt-2 max-w-[200px]">Upload match footage to visualize tactical patterns and movements.</p>
              </div>
            )}

            {isAnalyzing && (
              <div className="h-full flex flex-col items-center justify-center text-center px-8">
                <div className="w-full max-w-[240px] mb-6">
                   <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden mb-2">
                     <div 
                       className={`h-full bg-emerald-500 rounded-full transition-all duration-500 ease-out ${retryCount > 0 ? 'bg-yellow-500' : ''}`}
                       style={{ width: `${progress}%` }}
                     />
                   </div>
                   <div className="flex justify-between text-[10px] font-mono text-emerald-500">
                     <span>{Math.round(progress)}%</span>
                     <span className="animate-pulse">{retryCount > 0 ? "RETRYING" : "PROCESSING"}</span>
                   </div>
                </div>
                <div className="space-y-2">
                  <h3 className={`font-bold tracking-widest uppercase text-sm animate-pulse ${retryCount > 0 ? 'text-yellow-500' : 'text-emerald-400'}`}>
                    {loadingStage}
                  </h3>
                </div>
              </div>
            )}

            {/* EVENTS TAB */}
            {analysisData && activeTab === 'events' && (
              <div className="space-y-0">
                 <div className="bg-slate-900/30 p-5 border-b border-slate-800 backdrop-blur-sm sticky top-0 z-10">
                    <div className="mb-6">
                      <div className="flex justify-between items-end mb-2">
                         <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Match Rhythm</h4>
                         <span className="text-[10px] font-mono text-slate-600">DURATION: {Math.floor(videoDuration/60)}:{(videoDuration%60).toFixed(0).padStart(2,'0')}</span>
                      </div>
                      <div className="h-12 relative w-full bg-slate-900 rounded border border-slate-800/50 flex items-center px-2">
                        <div className="absolute left-2 right-2 h-0.5 bg-slate-800"></div>
                        {analysisData.events.map((evt, i) => {
                          const pct = videoDuration > 0 ? (evt.seconds / videoDuration) * 100 : 0;
                          return (
                            <div 
                              key={i}
                              onClick={() => jumpToTime(evt.seconds)}
                              className="absolute w-3 h-3 rounded-full border-2 border-[#0f1422] cursor-pointer hover:scale-150 transition-transform group z-10"
                              style={{ 
                                left: `${pct}%`, 
                                backgroundColor: getEventColor(evt.type),
                                transform: 'translateX(-50%)'
                              }}
                            />
                          );
                        })}
                        <div 
                          className="absolute top-0 bottom-0 w-0.5 bg-white z-20 pointer-events-none"
                          style={{ left: `${(currentVideoTime / (videoDuration || 1)) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                 </div>

                 <div className="p-4 space-y-2">
                   {analysisData.events?.map((event, idx) => (
                    <div 
                      key={idx}
                      onClick={() => jumpToTime(event.seconds)}
                      className={`
                        group p-3 rounded-lg border cursor-pointer transition-all duration-200
                        ${Math.abs(currentVideoTime - event.seconds) < 3
                          ? 'bg-emerald-900/10 border-emerald-500/30' 
                          : 'bg-slate-900/20 border-slate-800 hover:bg-slate-800 hover:border-slate-700'}
                      `}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">{getEventIcon(event.type)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-1">
                            <span className={`text-xs font-bold uppercase ${Math.abs(currentVideoTime - event.seconds) < 3 ? 'text-emerald-400' : 'text-slate-300'}`}>
                              {event.type}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                              {event.timestamp}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 leading-snug group-hover:text-slate-300 truncate">
                            {event.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PLAYER ANALYSIS TAB */}
            {analysisData && activeTab === 'players' && (
              <div className="p-5 space-y-4">
                 {(!analysisData.player_analysis || analysisData.player_analysis.length === 0) && (
                   <div className="text-center py-10 opacity-50">
                     <Users className="w-10 h-10 mx-auto mb-3 text-slate-600" />
                     <p className="text-sm text-slate-500">No specific player patterns detected in this clip.</p>
                   </div>
                 )}
                 
                 {analysisData.player_analysis?.map((player, idx) => (
                   <div key={idx} className="bg-slate-900/40 border border-slate-800 rounded-lg p-4 hover:border-emerald-500/30 transition-colors">
                     <div className="flex justify-between items-start mb-2">
                       <div className="flex items-center gap-2">
                         <div className="bg-slate-800 p-1.5 rounded text-emerald-500">
                           <Users className="w-4 h-4" />
                         </div>
                         <div>
                           <h4 className="font-bold text-sm text-white">{player.player}</h4>
                           <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{player.action_type}</span>
                         </div>
                       </div>
                       {player.impact === 'High' && (
                         <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
                           HIGH IMPACT
                         </span>
                       )}
                     </div>
                     <p className="text-sm text-slate-300 mb-3 leading-relaxed">
                       {player.description}
                     </p>
                     {player.time_start && (
                       <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono bg-slate-950/50 inline-flex px-2 py-1 rounded cursor-pointer hover:bg-slate-800 hover:text-white transition-colors"
                          onClick={() => {
                             // Simple duration parsing MM:SS to seconds
                             const parts = player.time_start?.split(':');
                             if (parts && parts.length === 2) {
                               const sec = parseInt(parts[0]) * 60 + parseInt(parts[1]);
                               jumpToTime(sec);
                             }
                          }}
                       >
                         <Clock className="w-3 h-3" />
                         <span>{player.time_start}</span>
                       </div>
                     )}
                   </div>
                 ))}
              </div>
            )}

            {/* TACTICS TAB */}
            {analysisData && activeTab === 'tactics' && (
              <div className="space-y-6 p-5">
                {analysisData.tactical_insights?.map((insight, idx) => (
                  <InsightCard 
                    key={idx} 
                    insight={insight} 
                    videoRef={videoRef}
                    apiKey={apiKey}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};
