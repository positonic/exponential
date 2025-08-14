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

  // Create or find a default user for seeding (you may want to replace with actual user ID)
  const defaultUser = await prisma.user.findFirst();
  if (defaultUser) {
    // Seed default project: Exponential
    await prisma.project.upsert({
      where: { slug: 'exponential' },
      update: {},
      create: {
        name: 'Exponential',
        slug: 'exponential',
        description: 'Main Exponential project for productivity and AI-powered workflows',
        status: 'ACTIVE',
        priority: 'HIGH',
        progress: 0.0,
        createdById: defaultUser.id,
      },
    });

    // Seed default exercises for user wellness tracking
    const defaultExercises = [
      { title: 'Morning Walk', description: 'Start the day with a 20-30 minute walk' },
      { title: 'Meditation', description: '10-15 minutes of mindfulness meditation' },
      { title: 'Strength Training', description: 'Basic strength exercises' },
      { title: 'Stretching', description: 'Full body stretching routine' },
    ];
    
    for (const exercise of defaultExercises) {
      const existing = await prisma.exercise.findFirst({ where: { title: exercise.title } });
      if (!existing) {
        await prisma.exercise.create({ data: exercise });
      }
    }

    // Seed sample integration for development/testing
    const existingIntegration = await prisma.integration.findFirst({
      where: {
        userId: defaultUser.id,
        provider: 'exponential-plugin'
      }
    });
    
    if (!existingIntegration) {
      await prisma.integration.create({
        data: {
          name: 'Exponential Plugin',
          type: 'API_KEY',
          provider: 'exponential-plugin',
          status: 'ACTIVE',
          description: 'Default integration for Exponential plugin transcriptions',
          userId: defaultUser.id,
        },
      });
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