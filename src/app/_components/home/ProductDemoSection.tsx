import { Container } from "@mantine/core";
// Uncomment when screenshot is ready:
// import Image from "next/image";

interface ProductDemoSectionProps {
  id?: string;
}

export function ProductDemoSection({ id }: ProductDemoSectionProps) {
  return (
    <section id={id} className="bg-surface-secondary py-20 md:py-28">
      <Container size="xl">
        <div className="text-center mb-12">
          <p className="text-text-muted uppercase tracking-wider text-sm font-medium mb-4">
            See it in action
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-text-primary">
            See what matters. Know where you stand. Move together.
          </h2>
        </div>

        {/* Product Screenshot */}
        <div className="relative rounded-xl overflow-hidden border border-border-primary shadow-2xl">
          {/* Browser Chrome */}
          <div className="bg-surface-tertiary px-4 py-3 flex items-center gap-2 border-b border-border-primary">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-brand-error/60" />
              <div className="w-3 h-3 rounded-full bg-brand-warning/60" />
              <div className="w-3 h-3 rounded-full bg-brand-success/60" />
            </div>
            <div className="flex-1 flex justify-center">
              <div className="bg-surface-secondary px-4 py-1 rounded-md text-sm text-text-muted">
                exponential.im
              </div>
            </div>
          </div>

          {/* Screenshot Placeholder - Replace with actual screenshot */}
          <div className="relative aspect-video bg-background-secondary">
            {/* Placeholder content - replace with Image component when screenshot available */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl mb-4">📱</div>
                <p className="text-text-muted">
                  Product screenshot will appear here
                </p>
                <p className="text-text-muted text-sm mt-2">
                  Replace this placeholder with your app screenshot
                </p>
              </div>
            </div>

            {/* Uncomment when screenshot is ready:
            <Image
              src="/images/app-screenshot.png"
              alt="Exponential app showing the Today view with goals, outcomes, and actions"
              fill
              className="object-cover object-top"
              priority
            />
            */}
          </div>
        </div>
      </Container>
    </section>
  );
}
