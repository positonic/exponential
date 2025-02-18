'use client';

import { type PropsWithChildren, useState, useEffect } from "react";
import { IconMenu2 } from "@tabler/icons-react";

export default function MobileNav({ children }: PropsWithChildren) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Lock body scroll when menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobileMenuOpen]);

  return (
    <div className="lg:hidden">
      {/* Mobile Menu Button - Made larger and more prominent */}
      <div className="fixed top-4 left-4 z-50">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-3 rounded-xl bg-gray-800 hover:bg-gray-700 active:bg-gray-600 transition-colors shadow-lg"
          aria-label="Toggle menu"
        >
          <IconMenu2 className="h-7 w-7" />
        </button>
      </div>

      {/* Mobile Sidebar - Enhanced with better animations and padding */}
      <div
        className={`${
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        } fixed top-0 left-0 h-full w-[85%] max-w-[300px] z-40 
        transition-transform duration-300 ease-out
        pt-16 shadow-xl`}
      >
        {children}
      </div>

      {/* Overlay - Enhanced with fade effect */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30
          animate-in fade-in duration-300"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </div>
  );
} 