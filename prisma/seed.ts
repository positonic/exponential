import { PrismaClient } from '@prisma/client';
import { seedReferenceData } from './referenceData';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  await seedReferenceData(prisma);

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