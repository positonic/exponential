interface NavLinkProps {
  href: string;
  children: React.ReactNode;
}

export function NavLink({ href, children }: NavLinkProps) {
  return (
    <a 
      href={href} 
      className="hover:text-white transition-colors"
      style={{ color: 'rgb(192, 132, 252)' }}
    >
      {children}
    </a>
  );
} 