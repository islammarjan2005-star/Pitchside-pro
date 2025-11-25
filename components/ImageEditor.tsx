import React, { useState } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Image as ImageIcon, Wand2, Download, ArrowRight, Loader2 } from 'lucide-react';

const MODEL_NAME = "gemini-2.5-flash-image";

export const ImageEditor: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setOriginalFile(file);
      const url = URL.createObjectURL(file);
      setOriginalImage(url);
      setGeneratedImage(null);
      setError(null);
    }
  };

  const fileToBase64 = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]); // Remove data url prefix
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleGenerate = async () => {
    if (!originalFile || !prompt) return;

    setIsGenerating(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const base64Data = await fileToBase64(originalFile);

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: originalFile.type,
                data: base64Data
              }
            },
            {
              text: prompt
            }
          ]
        }
      });

      // Find the image part in the response
      let foundImage = false;
      const parts = response.candidates?.[0]?.content?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.inlineData && part.inlineData.data) {
            const imgUrl = `data:image/png;base64,${part.inlineData.data}`;
            setGeneratedImage(imgUrl);
            foundImage = true;
            break;
          }
        }
      }

      if (!foundImage) {
        throw new Error("No image generated. The model might have refused the request or returned only text.");
      }

    } catch (err: any) {
      console.error("Generation Error", err);
      setError(err.message || "Failed to generate image.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800">
        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          <Wand2 className="text-emerald-450" />
          AI Image Editor
        </h2>
        <p className="text-slate-400 mb-6">Upload an image and use natural language to edit it (e.g., "Add a retro filter", "Make it snow", "Turn this into a sketch").</p>

        <div className="flex flex-col md:flex-row gap-4">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your edit (e.g., 'Add fireworks in the background')"
            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
          />
          <button
            onClick={handleGenerate}
            disabled={!originalImage || !prompt || isGenerating}
            className={`
              px-8 py-3 rounded-lg font-bold transition-all flex items-center gap-2 whitespace-nowrap
              ${!originalImage || !prompt || isGenerating 
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'}
            `}
          >
            {isGenerating ? <Loader2 className="animate-spin w-5 h-5" /> : <Wand2 className="w-5 h-5" />}
            Generate
          </button>
        </div>
        {error && <p className="mt-2 text-red-400 text-sm">{error}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-1 min-h-0">
        {/* Original */}
        <div className="flex flex-col gap-2 h-full">
          <span className="text-sm font-medium text-slate-400 uppercase tracking-wider">Original</span>
          <div className="relative flex-1 bg-black rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center group">
            {originalImage ? (
              <img src={originalImage} alt="Original" className="max-w-full max-h-full object-contain" />
            ) : (
              <div className="text-center p-8">
                <ImageIcon className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg transition-colors">
                  Upload Image
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                </label>
              </div>
            )}
            {originalImage && (
               <label className="absolute bottom-4 right-4 cursor-pointer bg-slate-900/80 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg text-sm transition-colors border border-slate-700 backdrop-blur-sm opacity-0 group-hover:opacity-100">
               Change Image
               <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
             </label>
            )}
          </div>
        </div>

        {/* Generated */}
        <div className="flex flex-col gap-2 h-full">
          <span className="text-sm font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
            Edited Result 
            {generatedImage && <span className="text-emerald-450 text-xs px-2 py-0.5 bg-emerald-500/10 rounded border border-emerald-500/20">Success</span>}
          </span>
          <div className="flex-1 bg-black rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center relative">
             {isGenerating ? (
               <div className="text-center space-y-3">
                 <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mx-auto" />
                 <p className="text-slate-400 animate-pulse">Designing new pixels...</p>
               </div>
             ) : generatedImage ? (
               <img src={generatedImage} alt="Generated" className="max-w-full max-h-full object-contain" />
             ) : (
               <div className="text-slate-600 flex flex-col items-center">
                 <ArrowRight className="w-10 h-10 mb-2 opacity-20" />
                 <p className="text-sm">Result will appear here</p>
               </div>
             )}
             
             {generatedImage && (
               <a 
                 href={generatedImage} 
                 download="pitchside-edit.png"
                 className="absolute bottom-4 right-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg transition-transform hover:scale-105"
               >
                 <Download className="w-4 h-4" />
                 Download
               </a>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};