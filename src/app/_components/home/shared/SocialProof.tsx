interface SocialProofProps {
  className?: string;
}

export function SocialProof({ className = "" }: SocialProofProps) {
  const companies = [
    { name: "TechCorp", width: "80px" },
    { name: "StartupX", width: "90px" },
    { name: "BuildCo", width: "85px" },
    { name: "ShipFast", width: "95px" },
  ];

  return (
    <div className={className}>
      <p className="text-text-muted text-sm font-medium mb-4">
        Trusted by 50+ founders
      </p>
      <div className="flex items-center justify-center gap-6 md:gap-8 flex-wrap opacity-60">
        {companies.map((company, index) => (
          <div
            key={index}
            className="px-4 py-2 border border-border-secondary rounded-lg bg-surface-secondary/50 backdrop-blur-sm"
            style={{ minWidth: company.width }}
          >
            <div className="text-text-muted text-xs font-semibold tracking-wider">
              {company.name}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
