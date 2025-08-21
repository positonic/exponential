'use client'
import { useState } from 'react';
import { SendHorizonal } from 'lucide-react';

export default function MultiChat() {
  const [messages, setMessages] = useState([
    { sender: 'ai', text: 'Hi! How can I help you today?' }
  ]);
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages([...messages, { sender: 'user', text: input }]);
    setInput('');
    setTimeout(() => {
      setMessages((prev) => [...prev, { sender: 'ai', text: `You said: ${input}` }]);
    }, 500);
  };

  return (
    <div className="flex h-screen w-full">
      {/* Sidebar */}
      <div className="w-64 bg-background-secondary text-text-primary border-r border-border-primary p-4 flex flex-col">
        <div className="text-xl font-bold mb-4">ChatGPT</div>
        <button className="bg-surface-secondary hover:bg-surface-hover text-text-primary p-2 rounded mb-2 text-left transition-colors">
          + New Chat
        </button>
        <div className="flex-1 overflow-auto">
          <div className="text-sm text-text-muted">Previous Chats</div>
          {/* Example chats */}
          <ul className="mt-2 space-y-1">
            <li className="hover:bg-surface-hover text-text-secondary p-2 rounded cursor-pointer transition-colors">Chat 1</li>
            <li className="hover:bg-surface-hover text-text-secondary p-2 rounded cursor-pointer transition-colors">Chat 2</li>
          </ul>
        </div>
        <div className="text-sm text-text-muted mt-4">User: you@example.com</div>
      </div>

      {/* Chat area */}
      <div className="flex flex-col flex-1 bg-background-primary">
        <div className="flex-1 overflow-auto p-6 space-y-4">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`max-w-xl px-4 py-2 rounded-lg shadow-sm ${
                msg.sender === 'user'
                  ? 'bg-brand-primary text-text-inverse self-end'
                  : 'bg-surface-secondary text-text-primary self-start'
              }`}
            >
              {msg.text}
            </div>
          ))}
        </div>

        {/* Input area */}
        <div className="border-t border-border-primary p-4">
          <div className="flex items-center gap-2">
            <textarea
              className="flex-1 resize-none border border-border-primary bg-surface-secondary text-text-primary rounded p-2 h-12 placeholder-text-muted focus:border-border-focus transition-colors"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Send a message"
            />
            <button
              className="bg-brand-primary text-text-inverse p-2 rounded hover:bg-brand-primary/90 transition-colors"
              onClick={handleSend}
            >
              <SendHorizonal size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
