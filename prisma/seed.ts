import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const defaultDifferentiators = [
  { value: "ai", label: "AI-Powered", isDefault: true },
  { value: "privacy", label: "Privacy-First", isDefault: true },
  { value: "opensource", label: "Open Source", isDefault: true },
  { value: "simple", label: "Simple & Easy to Use", isDefault: true },
  { value: "fast", label: "Fast & Performant", isDefault: true },
  { value: "customizable", label: "Highly Customizable", isDefault: true },
  { value: "integrated", label: "Well Integrated", isDefault: true },
  { value: "secure", label: "Enterprise-Grade Security", isDefault: true },
];

const defaultAudiences = [
  { value: "developers", label: "Developers", isDefault: true },
  { value: "designers", label: "Designers", isDefault: true },
  { value: "founders", label: "Startup Founders", isDefault: true },
  { value: "marketers", label: "Marketers", isDefault: true },
  { value: "freelancers", label: "Freelancers", isDefault: true },
  { value: "enterprise", label: "Enterprise Teams", isDefault: true },
  { value: "creators", label: "Content Creators", isDefault: true },
  { value: "educators", label: "Educators", isDefault: true },
];

async function main() {
  console.log('Start seeding...');

  // Seed differentiators
  for (const diff of defaultDifferentiators) {
    await prisma.differentiator.upsert({
      where: { value: diff.value },
      update: diff,
      create: diff,
    });
  }

  // Seed audiences
  for (const aud of defaultAudiences) {
    await prisma.audience.upsert({
      where: { value: aud.value },
      update: aud,
      create: aud,
    });
  }

  // Seed life domains
  const defaultLifeDomains = [
    { title: 'Work' },
    { title: 'Home' },
    { title: 'Personal' },
    { title: 'Finance' },
  ];
  for (const domain of defaultLifeDomains) {
    const existing = await prisma.lifeDomain.findFirst({ where: { title: domain.title } });
    if (!existing) {
      await prisma.lifeDomain.create({ data: domain });
    }
  }

  console.log('Seeding finished.');
}

await main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 