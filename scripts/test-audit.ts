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

if (import.meta.main) {
  testConnection();
}