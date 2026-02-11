'use client'; // May be needed if onClick is used, keep it for safety

import Link from 'next/link';
import Image from 'next/image'; // Import Next.js Image component
import { type ThemeConfig } from '~/config/themes';

interface LogoDisplayProps {
  theme: ThemeConfig;
  href?: string;
  onClick?: () => void;
  className?: string; // This className will now primarily affect the text size
  imageSize?: number; // Optional prop to control image size
}

export function LogoDisplay({ theme, href, onClick, className: _className, imageSize = 60 }: LogoDisplayProps) {
  // Base classes for the container (now without text color/gradient)
  const containerClasses = `flex items-center`; 
  
  // Determine if the logo is an image path or an emoji
  const isImagePath = theme.logo.includes('/');

  const logoElement = isImagePath ? (
    <Image 
      src={theme.logo} 
      alt={`${theme.name} logo`} 
      width={imageSize} // Use prop for size
      height={imageSize} // Use prop for size
      className="mr-2 object-contain" // Margin and contain object fit
    />
  ) : (
    <span className="text-xl mr-2">{theme.logo}</span> 
  );

  const content = (
    <>
      {logoElement} {/* Render the conditional logo element */}
      {/* Text with Inter font, theme-aware color */}
      <span 
        className="font-inter font-bold text-text-primary"
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