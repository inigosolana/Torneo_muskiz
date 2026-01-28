import React, { useState, useRef, useEffect } from 'react';
import { sendChatMessage } from '../services/geminiService';
import { ChatMessage } from '../types';

export const ChatBot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', role: 'model', text: '¡Hola! Puedo ayudarte con las reglas, el calendario o encontrar los baños más cercanos. ¡Pregúntame lo que quieras!', timestamp: new Date() }
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // Format history for Gemini
    const history = messages.map(m => ({
      role: m.role,
      parts: [{ text: m.text }]
    }));

    const responseText = await sendChatMessage(history, userMsg.text);

    const botMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'model',
      text: responseText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, botMsg]);
    setLoading(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none">
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-4 w-80 sm:w-96 bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col pointer-events-auto transition-all animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="bg-primary p-4 flex justify-between items-center text-background-dark">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined filled-icon">smart_toy</span>
              <h3 className="font-bold text-sm uppercase tracking-wide">Asistente del Torneo</h3>
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:bg-black/10 rounded-full p-1">
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
          
          <div className="flex-1 h-80 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-[#152323]">
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    msg.role === 'user' 
                      ? 'bg-primary text-background-dark rounded-br-none font-medium' 
                      : 'bg-white dark:bg-surface-dark text-slate-800 dark:text-slate-200 border border-gray-100 dark:border-white/5 rounded-bl-none shadow-sm'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-surface-dark rounded-2xl rounded-bl-none px-4 py-3 shadow-sm border border-gray-100 dark:border-white/5">
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce"></span>
                    <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce delay-75"></span>
                    <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce delay-150"></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="p-3 bg-white dark:bg-surface-dark border-t border-gray-100 dark:border-white/10">
            <div className="relative">
              <input 
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Pregunta sobre reglas, horarios..."
                className="w-full bg-gray-100 dark:bg-background-dark border-transparent focus:border-primary focus:ring-0 rounded-full pl-4 pr-12 py-2.5 text-sm text-slate-900 dark:text-white"
              />
              <button 
                type="submit"
                disabled={!input.trim() || loading}
                className="absolute right-1 top-1 p-1.5 bg-primary text-background-dark rounded-full hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <span className="material-symbols-outlined text-sm font-bold">send</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Toggle Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`pointer-events-auto shadow-lg hover:shadow-primary/40 transition-all duration-300 ${
          isOpen 
            ? 'w-12 h-12 rounded-full bg-slate-700 text-white' 
            : 'group flex items-center gap-3 pr-6 pl-2 py-2 bg-primary text-background-dark rounded-full'
        }`}
      >
        <div className={`flex items-center justify-center rounded-full ${isOpen ? '' : 'w-10 h-10 bg-black/10'}`}>
          <span className="material-symbols-outlined text-2xl">
            {isOpen ? 'close' : 'chat_bubble'}
          </span>
        </div>
        {!isOpen && (
           <span className="font-bold text-sm uppercase tracking-wide">Preguntar a IA</span>
        )}
      </button>
    </div>
  );
};