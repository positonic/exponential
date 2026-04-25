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

  // Seed life domains (Wheel of Life categories)
  // Maps old domains to new ones: Work→Career, Finance→Finance, Personal→Personal Growth, Home→Physical Environment
  const wheelOfLifeDomains = [
    {
      title: 'Career/Business',
      description: 'Your professional life, job satisfaction, career growth, and work-life balance',
      icon: 'IconBriefcase',
      color: 'brand-primary',
      displayOrder: 1,
      isActive: true,
    },
    {
      title: 'Finance/Wealth',
      description: 'Financial security, savings, investments, debt management, and money mindset',
      icon: 'IconCoin',
      color: 'brand-success',
      displayOrder: 2,
      isActive: true,
    },
    {
      title: 'Health/Fitness',
      description: 'Physical health, exercise, nutrition, sleep, energy levels, and self-care',
      icon: 'IconHeartbeat',
      color: 'avatar-red',
      displayOrder: 3,
      isActive: true,
    },
    {
      title: 'Family/Relationships',
      description: 'Relationships with parents, siblings, children, and extended family',
      icon: 'IconUsers',
      color: 'avatar-teal',
      displayOrder: 4,
      isActive: true,
    },
    {
      title: 'Romance/Partnership',
      description: 'Romantic relationships, intimacy, partnership, and connection with your significant other',
      icon: 'IconHeart',
      color: 'avatar-pink',
      displayOrder: 5,
      isActive: true,
    },
    {
      title: 'Personal Growth',
      description: 'Learning, self-improvement, skills development, education, and becoming your best self',
      icon: 'IconTrendingUp',
      color: 'avatar-blue',
      displayOrder: 6,
      isActive: true,
    },
    {
      title: 'Fun/Recreation',
      description: 'Hobbies, leisure activities, enjoyment, play, and things that bring you joy',
      icon: 'IconConfetti',
      color: 'avatar-yellow',
      displayOrder: 7,
      isActive: true,
    },
    {
      title: 'Physical Environment',
      description: 'Your home, workspace, surroundings, and the spaces where you spend your time',
      icon: 'IconHome',
      color: 'avatar-green',
      displayOrder: 8,
      isActive: true,
    },
    {
      title: 'Social/Friends',
      description: 'Friendships, social connections, community involvement, and support network',
      icon: 'IconFriends',
      color: 'avatar-plum',
      displayOrder: 9,
      isActive: true,
    },
    {
      title: 'Spirituality/Purpose',
      description: 'Meaning, purpose, values, spiritual practices, and connection to something greater',
      icon: 'IconSparkles',
      color: 'avatar-lavender',
      displayOrder: 10,
      isActive: true,
    },
  ];

  for (const domain of wheelOfLifeDomains) {
    await prisma.lifeDomain.upsert({
      where: { id: domain.displayOrder }, // Use displayOrder as ID for consistency
      update: domain,
      create: domain,
    });
  }

  // Deactivate old domains that don't match the new schema (if they exist)
  const oldDomainTitles = ['Work', 'Home', 'Personal', 'Finance'];
  for (const title of oldDomainTitles) {
    const existing = await prisma.lifeDomain.findFirst({ where: { title } });
    if (existing) {
      await prisma.lifeDomain.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
    }
  }

  // Seed system tags for actions (global tags available in all workspaces)
  const systemTags = [
    { slug: 'bug', name: 'Bug', color: 'avatar-red', description: 'Something is not working correctly' },
    { slug: 'agenda-item', name: 'Agenda Item', color: 'avatar-blue', description: 'To be discussed in a meeting' },
    { slug: 'feature', name: 'Feature', color: 'avatar-green', description: 'New functionality request' },
    { slug: 'enhancement', name: 'Enhancement', color: 'avatar-teal', description: 'Improvement to existing functionality' },
    { slug: 'question', name: 'Question', color: 'avatar-yellow', description: 'Needs clarification or answer' },
    { slug: 'documentation', name: 'Documentation', color: 'avatar-lightBlue', description: 'Related to documentation' },
    { slug: 'urgent', name: 'Urgent', color: 'brand-error', description: 'Requires immediate attention' },
    { slug: 'blocked', name: 'Blocked', color: 'avatar-orange', description: 'Cannot proceed due to dependency' },
    { slug: 'needs-review', name: 'Needs Review', color: 'avatar-lavender', description: 'Ready for review' },
    { slug: 'meeting-followup', name: 'Meeting Follow-up', color: 'avatar-plum', description: 'Action from a meeting' },
    { slug: 'research', name: 'Research', color: 'avatar-mint', description: 'Requires investigation' },
    { slug: 'idea', name: 'Idea', color: 'avatar-lightYellow', description: 'Potential future work' },
  ];

  console.log('Seeding system tags...');
  for (const tag of systemTags) {
    // Check if tag already exists (findFirst since null in composite unique is tricky)
    const existingTag = await prisma.tag.findFirst({
      where: {
        slug: tag.slug,
        workspaceId: null,
      },
    });

    if (existingTag) {
      await prisma.tag.update({
        where: { id: existingTag.id },
        data: {
          name: tag.name,
          color: tag.color,
          description: tag.description,
          isSystem: true,
        },
      });
    } else {
      await prisma.tag.create({
        data: {
          slug: tag.slug,
          name: tag.name,
          color: tag.color,
          description: tag.description,
          isSystem: true,
          workspaceId: null,
          createdById: null,
        },
      });
    }
  }
  console.log('System tags seeded.');

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