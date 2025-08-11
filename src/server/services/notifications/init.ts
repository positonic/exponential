import { notificationScheduler } from './NotificationScheduler';

// Initialize notification scheduler on server startup
if (typeof window === 'undefined') {
  // Only run on server
  console.log('Initializing notification scheduler...');
  notificationScheduler.start();
  
  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, stopping notification scheduler...');
    notificationScheduler.stop();
  });
  
  process.on('SIGINT', () => {
    console.log('SIGINT received, stopping notification scheduler...');
    notificationScheduler.stop();
  });
}

export { notificationScheduler };