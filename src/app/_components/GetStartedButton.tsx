import React from 'react';
import Link from 'next/link';

interface GetStartedButtonProps {
  className?: string;
  showArrow?: boolean;
  href?: string;
  size?: 'default' | 'small';
}

export function GetStartedButton({ 
  className = '', 
  showArrow = true, 
  href = "/signin",
  size = 'default'
}: GetStartedButtonProps) {
  // Calculate padding and text size based on the size prop
  const sizeClasses = size === 'small' 
    ? 'px-5 py-2 text-sm' 
    : 'px-6 py-3 text-base';
  
  return (
    <Link 
      href={href} 
      className={`${sizeClasses} font-semibold rounded-md flex items-center gap-2 transition-all hover:shadow-lg text-white bg-[#0339CF] hover:bg-[#0253E0] ${className}`}
    >
      Get Started {showArrow && <span className="ml-1">→</span>}
    </Link>
  );
}