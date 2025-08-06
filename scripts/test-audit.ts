import { db } from '../src/server/db';

async function testConnection() {
  try {
    console.log('Testing database connection...');
    const integrationCount = await db.integration.count({
      where: { provider: 'slack' }
    });
    console.log(`Found ${integrationCount} Slack integrations`);
    
    const mappingCount = await db.integrationUserMapping.count({
      where: {
        integration: {
          provider: 'slack'
        }
      }
    });
    console.log(`Found ${mappingCount} Slack user mappings`);
    
    console.log('✅ Database connection successful');
  } catch (error) {
    console.error('❌ Database error:', error);
  } finally {
    await db.$disconnect();
  }
}

// Check if running directly with Bun or Node.js
if (typeof require !== 'undefined' && require.main === module) {
  testConnection();
} else if (typeof import.meta !== 'undefined' && (import.meta as any).main) {
  testConnection();
}