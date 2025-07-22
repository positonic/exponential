// Simple test script - run with: bun test-fireflies.ts
import { FirefliesService } from './src/server/services/FirefliesService';

// Test action item parsing
const mockSummary = {
  action_items: [
    "John will send the proposal by Friday",
    "@sarah needs to review the budget before next week",  
    "Schedule follow-up meeting with client asap",
    "Update the documentation whenever possible"
  ],
  keywords: ["budget", "proposal", "client"],
  overview: "Discussed Q4 planning and resource allocation",
  short_summary: "Team meeting covering budget review and proposal timeline"
};

console.log('🧪 Testing FirefliesService...');

const actionItems = FirefliesService.parseActionItems(mockSummary);
console.log('📋 Parsed Action Items:');
actionItems.forEach((item, i) => {
  console.log(`${i + 1}. "${item.text}"`);
  if (item.assignee) console.log(`   → Assignee: ${item.assignee}`);
  if (item.dueDate) console.log(`   → Due: ${item.dueDate.toLocaleDateString()}`);
  if (item.priority) console.log(`   → Priority: ${item.priority}`);
});

console.log('\n📄 Notification Summary:');
const notification = FirefliesService.generateNotificationSummary(mockSummary, actionItems.length);
console.log(notification);