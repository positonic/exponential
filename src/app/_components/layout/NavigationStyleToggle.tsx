"use client";

import { IconPalette } from "@tabler/icons-react";
import { useState, useEffect } from "react";

interface NavigationStyleToggleProps {
  onToggle: (isModern: boolean) => void;
}

export function NavigationStyleToggle({ onToggle }: NavigationStyleToggleProps) {
  const [isModern, setIsModern] = useState(false);

  // Load saved preference from localStorage
  useEffect(() => {
    const savedStyle = localStorage.getItem('navigation-style');
    const shouldUseModern = savedStyle === 'modern';
    setIsModern(shouldUseModern);
    onToggle(shouldUseModern);
  }, [onToggle]);

  const handleToggle = () => {
    const newValue = !isModern;
    setIsModern(newValue);
    localStorage.setItem('navigation-style', newValue ? 'modern' : 'classic');
    onToggle(newValue);
  };

  return (
    <div className="px-3 py-2 border-t border-gray-700/50 mt-2">
      <label className="flex items-center gap-3 cursor-pointer group">
        <IconPalette 
          size={18} 
          className="text-gray-400 group-hover:text-gray-300 transition-colors duration-200" 
        />
        <span className="text-sm text-gray-400 group-hover:text-gray-300 flex-1 transition-colors duration-200">
          Modern Navigation
        </span>
        <div className="relative">
          <input
            type="checkbox"
            checked={isModern}
            onChange={handleToggle}
            className="sr-only"
          />
          <div
            className={`w-10 h-6 rounded-full transition-all duration-300 ${
              isModern
                ? 'bg-gradient-to-r from-blue-500 to-purple-600 shadow-lg shadow-blue-500/20'
                : 'bg-gray-600'
            }`}
          >
            <div
              className={`w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 transform ${
                isModern ? 'translate-x-5' : 'translate-x-1'
              } mt-1`}
            />
          </div>
        </div>
      </label>
    </div>
  );
}