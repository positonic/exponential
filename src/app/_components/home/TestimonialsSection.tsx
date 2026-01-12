import { Container, SimpleGrid } from "@mantine/core";
import { IconQuote } from "@tabler/icons-react";

interface TestimonialsSectionProps {
  id?: string;
}

const testimonials = [
  {
    quote:
      "I went from 47 tasks to 5 outcomes. For the first time, I know exactly what to focus on.",
    name: "Sarah Chen",
    title: "Founder",
    company: "TechStart",
    avatar: "SC",
  },
  {
    quote:
      "We cut our planning time by 60%. The weekly rhythm keeps everyone aligned without the meetings.",
    name: "Marcus Rivera",
    title: "CTO",
    company: "BuildFast",
    avatar: "MR",
  },
  {
    quote:
      "Finally, a tool that understands outcomes matter more than task counts. Game changer for our team.",
    name: "Alex Kim",
    title: "Product Lead",
    company: "ShipCo",
    avatar: "AK",
  },
];

export function TestimonialsSection({ id }: TestimonialsSectionProps) {
  return (
    <section id={id} className="bg-surface-secondary py-20 md:py-28">
      <Container size="lg">
        <div className="text-center mb-16">
          <p className="text-text-muted uppercase tracking-wider text-sm font-medium mb-4">
            Testimonials
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-text-primary">
            Loved by founders who ship
          </h2>
        </div>

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="bg-background-primary border border-border-primary rounded-2xl p-8 relative"
            >
              {/* Quote Icon */}
              <IconQuote
                size={32}
                className="text-accent-periwinkle/30 mb-4"
                stroke={1.5}
              />

              {/* Quote */}
              <blockquote className="text-text-primary text-lg leading-relaxed mb-6">
                &ldquo;{testimonial.quote}&rdquo;
              </blockquote>

              {/* Author */}
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-accent-indigo/20 flex items-center justify-center">
                  <span className="text-accent-indigo font-semibold text-sm">
                    {testimonial.avatar}
                  </span>
                </div>

                {/* Info */}
                <div>
                  <p className="font-semibold text-text-primary">
                    {testimonial.name}
                  </p>
                  <p className="text-sm text-text-muted">
                    {testimonial.title} @ {testimonial.company}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </SimpleGrid>
      </Container>
    </section>
  );
}
