// Manual test script for WhatsApp Analytics System
// This will test the core functionality without relying on TypeScript compilation

console.log('🧪 Starting WhatsApp Analytics System Test...');

const testEndpoints = [
  '/api/webhooks/whatsapp/health',
  '/api/workers/whatsapp',
  '/api/cron/whatsapp-analytics'
];

async function testHealthEndpoint() {
  console.log('\n📊 Testing Health Check Endpoint...');
  try {
    const response = await fetch('http://localhost:3000/api/webhooks/whatsapp/health');
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Health endpoint working:', data.status);
      return true;
    } else {
      console.log('❌ Health endpoint failed:', response.status);
      return false;
    }
  } catch (error) {
    console.log('❌ Health endpoint error:', error.message);
    return false;
  }
}

async function testWorkerEndpoint() {
  console.log('\n⚙️ Testing Worker Status Endpoint...');
  try {
    const response = await fetch('http://localhost:3000/api/workers/whatsapp');
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Worker endpoint working:', data.status);
      return true;
    } else {
      console.log('❌ Worker endpoint failed:', response.status);
      return false;
    }
  } catch (error) {
    console.log('❌ Worker endpoint error:', error.message);
    return false;
  }
}

async function testAnalyticsEndpoint() {
  console.log('\n📈 Testing Analytics Cron Endpoint...');
  try {
    const response = await fetch('http://localhost:3000/api/cron/whatsapp-analytics', {
      method: 'POST'
    });
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Analytics endpoint working:', data.success);
      return true;
    } else {
      console.log('❌ Analytics endpoint failed:', response.status);
      return false;
    }
  } catch (error) {
    console.log('❌ Analytics endpoint error:', error.message);
    return false;
  }
}

async function runTests() {
  const results = [];
  
  results.push(await testHealthEndpoint());
  results.push(await testWorkerEndpoint());
  results.push(await testAnalyticsEndpoint());
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log('\n📋 Test Results:');
  console.log(`✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${total - passed}/${total}`);
  
  if (passed === total) {
    console.log('\n🎉 All tests passed! Analytics system is functional.');
  } else {
    console.log('\n⚠️ Some tests failed. Manual verification needed.');
  }
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runTests, testHealthEndpoint, testWorkerEndpoint, testAnalyticsEndpoint };
} else {
  // Run tests if in browser environment
  runTests();
}