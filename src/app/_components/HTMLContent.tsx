import DOMPurify from 'dompurify';

// Shared component to render HTML content safely with sanitization
interface HTMLContentProps {
  html: string;
  className?: string;
}

export const HTMLContent = ({ html, className }: HTMLContentProps) => {
  // Sanitize HTML to prevent XSS attacks
  const sanitizedHtml = DOMPurify.sanitize(html, {
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