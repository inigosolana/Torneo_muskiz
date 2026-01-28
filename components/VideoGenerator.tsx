import React, { useState } from 'react';
import { generateHighlightVideo } from '../services/geminiService';

interface VideoGeneratorProps {
    onClose: () => void;
}

export const VideoGenerator: React.FC<VideoGeneratorProps> = ({ onClose }) => {
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);

    const handleGenerate = async () => {
        if (!prompt) return;
        setIsLoading(true);
        try {
            const url = await generateHighlightVideo(prompt);
            setVideoUrl(url);
        } catch (error) {
            alert("Error generando video. Asegúrate de haber seleccionado una API key de pago.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in">
            <div className="bg-background-dark border border-white/10 w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white"><span className="material-symbols-outlined">close</span></button>
                
                <div className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                        <span className="material-symbols-outlined text-primary text-3xl">movie_filter</span>
                        <h2 className="text-2xl font-bold text-white">Estudio de Highlights Veo</h2>
                    </div>

                    {!videoUrl ? (
                        <>
                            <div className="mb-6">
                                <label className="block text-sm font-bold text-slate-300 mb-2">Describe la jugada</label>
                                <textarea 
                                    className="w-full h-32 bg-surface-dark border border-white/10 rounded-xl p-4 text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none"
                                    placeholder="ej. Una toma cinematográfica en cámara lenta de un jugador de balonmano playa saltando alto para marcar un gol contra el cielo azul, resolución 4k, fotorrealista."
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                ></textarea>
                                <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-xs">info</span> 
                                    Potenciado por Google Veo. Requiere API Key de pago.
                                </p>
                            </div>
                            
                            <button 
                                onClick={handleGenerate}
                                disabled={isLoading || !prompt}
                                className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${isLoading ? 'bg-slate-700 cursor-wait' : 'bg-primary hover:bg-primary-dark text-background-dark'}`}
                            >
                                {isLoading ? (
                                    <>
                                        <span className="material-symbols-outlined animate-spin">progress_activity</span>
                                        Generando (esto puede tardar un minuto)...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined">auto_awesome</span>
                                        Generar Video
                                    </>
                                )}
                            </button>
                        </>
                    ) : (
                        <div className="flex flex-col items-center animate-in zoom-in">
                            <video src={videoUrl} controls autoPlay loop className="w-full rounded-xl shadow-lg border border-white/10 mb-6 aspect-video"></video>
                            <div className="flex gap-4">
                                <a href={videoUrl} download className="bg-white text-background-dark px-6 py-2 rounded-lg font-bold flex items-center gap-2">
                                    <span className="material-symbols-outlined">download</span> Descargar
                                </a>
                                <button onClick={() => setVideoUrl(null)} className="text-slate-400 px-6 py-2 hover:text-white">Generar Otro</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};