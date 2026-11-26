'use client';

import React, { useState } from 'react';
import { MessageSquare, Send, X, Mic, MicOff } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  meta?: string;
}

export function AIAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', text: 'Hi! Ask me about your active token status, QR check-in, Snooze, Late Pass rules, or organizations.' },
  ]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
    setInput('');
    setLoading(true);
    try {
      const res = await apiFetch<{ reply: string; provider: string; disclaimer: string }>('/assistant/chat', {
        method: 'POST',
        body: JSON.stringify({ message: trimmed }),
      });
      setMessages((prev) => [...prev, { role: 'assistant', text: res.reply, meta: res.disclaimer }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', text: 'Unable to reach assistant right now.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleVoice = () => {
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition() as {
      lang: string;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onend: () => void;
      start: () => void;
    };
    recognition.lang = 'en-US';
    setListening(true);
    recognition.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript;
      if (transcript) setInput(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.start();
  };

  return (
    <div className="fixed bottom-5 right-5 z-40 no-print">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-slate-800"
        >
          <MessageSquare className="h-4 w-4 text-sky-400" />
          Queue Assistant
        </button>
      ) : (
        <div className="flex h-[420px] w-80 sm:w-96 flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold">Virtual Queue Assistant</p>
              <p className="text-[11px] text-slate-300">Live guidance & FAQ</p>
            </div>
            <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-slate-800">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
            {messages.map((m, idx) => (
              <div key={idx} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2 text-xs leading-relaxed ${
                    m.role === 'user' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-800'
                  }`}
                >
                  {m.text}
                </div>
                {m.meta && <span className="mt-1 text-[10px] text-slate-400">{m.meta}</span>}
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="flex items-center gap-2 border-t border-slate-200 bg-white p-2.5"
          >
            <button
              type="button"
              onClick={handleVoice}
              title="Voice input"
              className={`rounded-lg p-2 ${listening ? 'bg-red-100 text-red-600' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your token..." className="flex-1 text-xs outline-none px-2 py-1.5" />
            <button type="submit" disabled={loading || !input.trim()} className="rounded-lg bg-slate-900 p-2 text-white hover:bg-slate-800 disabled:opacity-40">
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
