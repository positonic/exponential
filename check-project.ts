import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkProject() {
  try {
    const projectId = "cmdddgwjl0000o5wp595s9t91";
    const slug = "exponential-cmdddgwjl0000o5wp595s9t91";
    
    console.log("Checking project with ID:", projectId);
    console.log("Full slug:", slug);
    
    // Check if project exists with this ID
    const projectById = await prisma.project.findUnique({
      where: { id: projectId },
      include: { actions: true }
    });
    
    console.log("\n--- Project by ID ---");
    if (projectById) {
      console.log("Project found!");
      console.log("Name:", projectById.name);
      console.log("Slug:", projectById.slug);
      console.log("Number of actions:", projectById.actions.length);
    } else {
      console.log("No project found with this ID");
    }
    
    // Check if project exists with this slug
    const projectBySlug = await prisma.project.findUnique({
      where: { slug: slug },
      include: { actions: true }
    });
    
    console.log("\n--- Project by Slug ---");
    if (projectBySlug) {
      console.log("Project found!");
      console.log("ID:", projectBySlug.id);
      console.log("Name:", projectBySlug.name);
      console.log("Number of actions:", projectBySlug.actions.length);
      
      // Show the actual actions
      if (projectBySlug.actions.length > 0) {
        console.log("\n--- Actions ---");
        projectBySlug.actions.forEach((action, index) => {
          console.log(`${index + 1}. ${action.name} (Status: ${action.status}, Priority: ${action.priority})`);
        });
      } else {
        console.log("\nNo actions found for this project");
      }
    } else {
      console.log("No project found with this slug");
    }
    
    // Also check if there are ANY actions with this projectId
    console.log("\n--- Direct Action Query ---");
    const actions = await prisma.action.findMany({
      where: { projectId: projectId }
    });
    console.log(`Found ${actions.length} actions with projectId=${projectId}`);
    
    // Let's also see what the actual projectId should be for this slug
    if (projectBySlug) {
      console.log("\n--- IMPORTANT ---");
      console.log("The actual project ID is:", projectBySlug.id);
      console.log("We were looking for:", projectId);
      console.log("Match?", projectBySlug.id === projectId);
    }
    
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkProject();