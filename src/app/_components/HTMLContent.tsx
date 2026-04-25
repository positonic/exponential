import DOMPurify from 'dompurify';
import { compactUrls as compactUrlsFn } from '~/lib/utils';

// Shared component to render HTML content safely with sanitization
interface HTMLContentProps {
  html: string;
  className?: string;
  /** When true, replaces inline URLs with clickable [link] labels at the end */
  compactUrls?: boolean;
}

export const HTMLContent = ({ html, className, compactUrls }: HTMLContentProps) => {
  const processedHtml = compactUrls ? compactUrlsFn(html) : html;

  // Sanitize HTML to prevent XSS attacks
  const sanitizedHtml = DOMPurify.sanitize(processedHtml, {
    ALLOWED_TAGS: ['a', 'strong', 'em', 'u', 's', 'br'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    ALLOW_DATA_ATTR: false,
  });

  return (
    <span
      className={className || "text-text-primary"}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
};