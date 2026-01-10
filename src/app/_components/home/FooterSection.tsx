import { Container } from "@mantine/core";
import Link from "next/link";
import { IconBrandTwitter, IconBrandGithub, IconBrandLinkedin } from "@tabler/icons-react";
import { LogoDisplay } from "../layout/LogoDisplay";
import { themes } from "~/config/themes";
import { getThemeDomain } from "~/config/site";

interface FooterSectionProps {
  id?: string;
}

const footerLinks = {
  product: [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Pricing", href: "#pricing" },
  ],
  company: [
    { label: "About", href: "/about" },
    { label: "Blog", href: "/blog" },
    { label: "Docs", href: "/docs" },
  ],
  legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
  ],
};

const socialLinks = [
  { icon: IconBrandTwitter, href: "https://twitter.com/exponentialim", label: "Twitter" },
  { icon: IconBrandGithub, href: "https://github.com/exponential", label: "GitHub" },
  { icon: IconBrandLinkedin, href: "https://linkedin.com/company/exponential", label: "LinkedIn" },
];

export function FooterSection({ id }: FooterSectionProps) {
  const domain = getThemeDomain();
  const theme = themes[domain];
  const currentYear = new Date().getFullYear();

  return (
    <footer
      id={id}
      className="bg-background-secondary border-t border-border-primary py-16"
    >
      <Container size="lg">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          {/* Logo & Description */}
          <div className="col-span-2">
            <LogoDisplay theme={theme} href="/" className="text-xl mb-4" />
            <p className="text-text-muted text-sm max-w-xs leading-relaxed">
              The alignment layer for teams that ship. Connect your daily work
              to what matters.
            </p>
          </div>

          {/* Product Links */}
          <div>
            <h4 className="font-semibold text-text-primary mb-4">Product</h4>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-text-muted text-sm hover:text-text-primary transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h4 className="font-semibold text-text-primary mb-4">Company</h4>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-text-muted text-sm hover:text-text-primary transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="font-semibold text-text-primary mb-4">Legal</h4>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-text-muted text-sm hover:text-text-primary transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-border-primary pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-text-muted text-sm">
            © {currentYear} Exponential. All rights reserved.
          </p>

          {/* Social Links */}
          <div className="flex items-center gap-4">
            {socialLinks.map((social) => {
              const Icon = social.icon;
              return (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-muted hover:text-text-primary transition-colors"
                  aria-label={social.label}
                >
                  <Icon size={20} stroke={1.5} />
                </a>
              );
            })}
          </div>
        </div>
      </Container>
    </footer>
  );
}
