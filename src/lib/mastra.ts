import { MastraClient } from '@mastra/client-js';
 
// Initialize the client
export const mastraClient = new MastraClient({
  baseUrl: process.env.MASTRA_API_URL || 'http://localhost:4111',
});