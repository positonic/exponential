interface GetStartedButtonProps {
  className?: string;
  showArrow?: boolean;
}

export function GetStartedButton({ className = '', showArrow = true }: GetStartedButtonProps) {
  return (
    <a 
      href="#" 
      className={`px-6 py-3 font-semibold rounded-md flex items-center gap-2 transition-all hover:shadow-lg hover:shadow-purple-500/20 text-white ${className}`}
      style={{ 
        background: 'linear-gradient(90deg, #8B5CF6 0%, #3B82F6 100%)'
      }}
    >
      Get Started {showArrow && <span className="ml-1">→</span>}
    </a>
  );
} 