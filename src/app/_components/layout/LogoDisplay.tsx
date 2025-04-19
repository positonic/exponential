'use client'; // May be needed if onClick is used, keep it for safety

import Link from 'next/link';
import { type ThemeConfig } from '~/config/themes';

interface LogoDisplayProps {
  theme: ThemeConfig;
  href?: string;
  onClick?: () => void;
  className?: string; // This className will now primarily affect the text size
}

export function LogoDisplay({ theme, href, onClick, className }: LogoDisplayProps) {
  // Base classes for the container (now without text color/gradient)
  const containerClasses = `flex items-center`; 
  
  const content = (
    <>
      {/* Logo with fixed size and white color */}
      <span className="text-2xl text-white mr-2">{theme.logo}</span> 
      {/* Text with Orbitron font, white color, and size controlled by className */}
      <span 
        className={`font-bold text-white ${className || 'text-xl'}`.trim()} 
        style={{ fontFamily: theme.fontFamily }}
      >
        {theme.name}
      </span>
    </>
  );

  if (href) {
    return (
      <Link 
        href={href} 
        onClick={onClick} 
        className={containerClasses}
      >
        {content}
      </Link>
    );
  }

  return (
    <div 
      onClick={onClick} 
      className={containerClasses}
    >
      {content}
    </div>
  );
} 