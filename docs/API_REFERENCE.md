# WhatsApp Integration API Reference

## Overview

This document provides comprehensive API reference for the WhatsApp Business API integration. It covers all available endpoints, data structures, authentication methods, and usage examples.

## Base URL

```
Production: https://yourdomain.com/api
Development: http://localhost:3000/api
```

## Authentication

The API uses NextAuth.js for authentication with JWT tokens. Include the session token in your requests.

### Headers Required
```http
Content-Type: application/json
Authorization: Bearer <session_token>
```

## Webhook Endpoints

### WhatsApp Webhook
Receives incoming WhatsApp messages and events.

#### GET /webhooks/whatsapp
**Purpose**: Webhook verification for Meta
**Method**: `GET`
**Authentication**: None (uses verify token)

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| hub.mode | string | Yes | Subscription mode ("subscribe") |
| hub.verify_token | string | Yes | Verification token |
| hub.challenge | string | Yes | Challenge string to return |

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: text/plain

<challenge_string>
```

#### POST /webhooks/whatsapp
**Purpose**: Process incoming WhatsApp messages
**Method**: `POST`
**Authentication**: Webhook signature verification

**Headers:**
```http
Content-Type: application/json
X-Hub-Signature-256: sha256=<signature>
```

**Request Body:**
```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "WABA_ID",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "15551234567",
              "phone_number_id": "PHONE_NUMBER_ID"
            },
            "messages": [
              {
                "from": "15551234567",
                "id": "wamid.xyz",
                "timestamp": "1234567890",
                "text": {
                  "body": "Hello, I need help with my tasks"
                },
                "type": "text"
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: text/plain

OK
```

### Health Check Endpoint
Monitor system health and performance.

#### GET /webhooks/whatsapp/health
**Purpose**: System health monitoring
**Method**: `GET`
**Authentication**: Optional

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600000,
  "checks": {
    "database": {
      "status": "healthy",
      "responseTime": 45
    },
    "circuitBreakers": {
      "status": "healthy",
      "whatsappApi": "closed",
      "aiProcessing": "closed"
    },
    "cache": {
      "status": "healthy",
      "hitRate": 0.85
    },
    "messageQueue": {
      "status": "healthy",
      "size": 5,
      "processing": 2
    },
    "errorRate": {
      "status": "healthy",
      "rate": 0.001
    }
  }
}
```

### Worker Status Endpoint
Monitor message queue and processing workers.

#### GET /workers/whatsapp
**Purpose**: Monitor worker status and queue metrics
**Method**: `GET`
**Authentication**: Optional

**Response:**
```json
{
  "status": "active",
  "workers": {
    "queue": {
      "status": "active",
      "queue": {
        "size": 10,
        "processing": 3,
        "completed": 1250,
        "failed": 5
      },
      "throughput": {
        "messagesPerMinute": 45.5,
        "avgProcessingTime": 850
      }
    }
  },
  "performance": {
    "memoryUsage": {
      "used": 125,
      "total": 512,
      "percentage": 24.4
    },
    "cacheMetrics": {
      "hitRate": 0.87,
      "missRate": 0.13
    }
  }
}
```

#### POST /workers/whatsapp
**Purpose**: Control worker operations
**Method**: `POST`
**Authentication**: Required

**Request Body:**
```json
{
  "action": "pause|resume|restart|clear_failed"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Worker action completed successfully",
  "newStatus": "paused"
}
```

## tRPC API Endpoints

The system uses tRPC for type-safe API calls. Below are the available procedures.

### WhatsApp Configuration

#### getConfig
Get WhatsApp configuration for an integration.

**Input:**
```typescript
{
  integrationId: string
}
```

**Output:**
```typescript
{
  id: string
  integration: {
    id: string
    name: string
    status: "ACTIVE" | "INACTIVE" | "PENDING" | "ERROR"
  }
  phoneNumberId: string
  businessAccountId: string
  displayPhoneNumber: string | null
  businessName: string | null
  templates: Array<{
    id: string
    name: string
    status: "APPROVED" | "PENDING" | "REJECTED"
    language: string
    category: string
  }>
}
```

#### testConnection
Test WhatsApp API connection.

**Input:**
```typescript
{
  integrationId: string
}
```

**Output:**
```typescript
{
  success: boolean
  businessName?: string
  error?: string
}
```

### Analytics and Monitoring

#### getWhatsAppAnalytics
Get analytics data for WhatsApp integration.

**Input:**
```typescript
{
  integrationId: string
  startDate?: Date
  endDate?: Date
}
```

**Output:**
```typescript
{
  totals: {
    messagesReceived: number
    messagesSent: number
    messagesDelivered: number
    messagesRead: number
    messagesFailed: number
    uniqueUsers: number
    totalConversations: number
    errorCount: number
  }
  averages: {
    avgResponseTime: number
    avgMessagesPerUser: number
    avgConversationLength: number
  }
  hourlyData: Array<{
    date: Date
    hour: number
    messagesReceived: number
    messagesSent: number
    messagesDelivered: number
    messagesFailed: number
    avgResponseTime: number
    maxResponseTime: number
    errorRate: number
  }>
}
```

#### getWhatsAppHealth
Get health status for WhatsApp integration.

**Input:**
```typescript
{
  integrationId: string
}
```

**Output:**
```typescript
{
  status: "healthy" | "degraded" | "unhealthy"
  timestamp: string
  uptime: number
  checks: {
    database: {
      status: "healthy" | "error"
      responseTime?: number
    }
    circuitBreakers: {
      status: "healthy" | "error"
      whatsappApi: "open" | "closed"
      aiProcessing: "open" | "closed"
    }
    cache: {
      status: "healthy" | "error"
      hitRate: number
    }
    messageQueue: {
      status: "healthy" | "error"
      size: number
      processing: number
    }
    errorRate: {
      status: "healthy" | "warning" | "error"
      rate: number
    }
  }
}
```

### User Management

#### getWhatsAppPhoneMappings
Get phone number mappings for WhatsApp integration.

**Input:**
```typescript
{
  integrationId: string
}
```

**Output:**
```typescript
Array<{
  id: string
  externalUserId: string // Phone number
  user: {
    id: string
    name: string | null
    email: string | null
  }
  integration: {
    id: string
    name: string
  }
  createdAt: Date
}>
```

#### createWhatsAppPhoneMapping
Create a new phone number mapping.

**Input:**
```typescript
{
  integrationId: string
  phoneNumber: string
  userId: string
}
```

**Output:**
```typescript
{
  success: boolean
  mapping?: {
    id: string
    externalUserId: string
    userId: string
    integrationId: string
  }
  error?: string
}
```

### Admin Endpoints

#### getAllWhatsAppIntegrations
Get all WhatsApp integrations (admin only).

**Input:** None

**Output:**
```typescript
Array<{
  id: string
  name: string
  status: "ACTIVE" | "INACTIVE" | "PENDING" | "ERROR"
  createdAt: Date
  whatsapp: {
    businessName: string | null
    displayPhoneNumber: string | null
    phoneNumberId: string
  } | null
  _count: {
    userMappings: number
  }
}>
```

#### getSystemWhatsAppAnalytics
Get system-wide WhatsApp analytics.

**Input:** None

**Output:**
```typescript
{
  todayMessages: number
  systemHealth: "healthy" | "degraded" | "unhealthy"
  activeIntegrations: number
  totalUsers: number
}
```

## Data Models

### WhatsApp Message
```typescript
interface WhatsAppMessage {
  id: string
  configId: string
  messageId: string
  phoneNumber: string
  direction: "INBOUND" | "OUTBOUND"
  messageType: "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT"
  content: Record<string, any>
  status: "SENT" | "DELIVERED" | "READ" | "FAILED"
  createdAt: Date
  updatedAt: Date
}
```

### Analytics Data
```typescript
interface MessageAnalytics {
  id: string
  whatsappConfigId: string
  date: Date
  hour: number
  messagesReceived: number
  messagesSent: number
  messagesDelivered: number
  messagesRead: number
  messagesFailed: number
  uniqueUsers: number
  avgResponseTime: number
  maxResponseTime: number
  totalConversations: number
  errorCount: number
  errorRate: number
}
```

### Performance Metrics
```typescript
interface PerformanceMetrics {
  id: string
  whatsappConfigId: string
  timestamp: Date
  metric: string
  value: number
  unit: string
  metadata?: Record<string, any>
}
```

## Error Handling

### Error Response Format
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "data": {
      "field": "Additional error context"
    }
  }
}
```

### Common Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `UNAUTHORIZED` | Invalid or missing authentication | 401 |
| `FORBIDDEN` | Insufficient permissions | 403 |
| `NOT_FOUND` | Resource not found | 404 |
| `BAD_REQUEST` | Invalid request data | 400 |
| `RATE_LIMIT_EXCEEDED` | Too many requests | 429 |
| `INTERNAL_SERVER_ERROR` | Server error | 500 |
| `WEBHOOK_VERIFICATION_FAILED` | Webhook signature invalid | 403 |
| `CONFIG_NOT_FOUND` | WhatsApp configuration missing | 404 |
| `MESSAGE_PROCESSING_FAILED` | Message processing error | 500 |

## Rate Limits

### WhatsApp API Limits
- **Messages**: 1,000 per day (can be increased)
- **Template Messages**: 250 per day initially
- **Webhook Requests**: No specific limit, but must respond < 20 seconds

### Application Limits
- **API Requests**: 100 requests per minute per user
- **Analytics Queries**: 10 requests per minute per user
- **Admin Operations**: 50 requests per hour

## Usage Examples

### Sending a Test Message (cURL)
```bash
curl -X POST "https://yourdomain.com/api/trpc/integration.sendTestMessage" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <session_token>" \
  -d '{
    "integrationId": "cm123456789",
    "phoneNumber": "+1234567890",
    "message": "Hello from the API!"
  }'
```

### Getting Analytics Data (cURL)
```bash
curl -X GET "https://yourdomain.com/api/trpc/integration.getWhatsAppAnalytics" \
  -H "Authorization: Bearer <session_token>" \
  -G \
  -d "integrationId=cm123456789" \
  -d "startDate=2024-01-01" \
  -d "endDate=2024-01-31"
```

### JavaScript/TypeScript Usage
```typescript
import { api } from "~/trpc/react";

// Get analytics data
const { data: analytics } = api.integration.getWhatsAppAnalytics.useQuery({
  integrationId: "cm123456789",
  startDate: new Date("2024-01-01"),
  endDate: new Date("2024-01-31"),
});

// Send test message
const sendMessage = api.integration.sendTestMessage.useMutation({
  onSuccess: () => {
    console.log("Message sent successfully!");
  },
  onError: (error) => {
    console.error("Failed to send message:", error);
  },
});

sendMessage.mutate({
  integrationId: "cm123456789",
  phoneNumber: "+1234567890",
  message: "Hello from React!",
});
```

## Webhooks and Events

### Webhook Signature Verification
All webhooks are signed with SHA-256. Verify signatures to ensure security:

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return signature === `sha256=${expectedSignature}`;
}
```

### Event Types

#### Message Events
- `message.received`: New inbound message
- `message.sent`: Outbound message sent
- `message.delivered`: Message delivered to recipient
- `message.read`: Message read by recipient
- `message.failed`: Message delivery failed

#### System Events
- `integration.connected`: WhatsApp integration established
- `integration.disconnected`: WhatsApp integration removed
- `user.mapped`: User phone number mapped
- `security.violation`: Security policy violation detected

## Development and Testing

### Local Development
```bash
# Start development server
npm run dev

# Run with logging
npm run dev:log

# Test webhook locally with ngrok
ngrok http 3000
```

### Testing Endpoints
```bash
# Health check
curl http://localhost:3000/api/webhooks/whatsapp/health

# Worker status
curl http://localhost:3000/api/workers/whatsapp

# Test webhook verification
curl "http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=your_token&hub.challenge=test_challenge"
```

## Support and Resources

### Official Documentation
- [WhatsApp Business API](https://developers.facebook.com/docs/whatsapp)
- [tRPC Documentation](https://trpc.io/)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)

### Getting Help
- Check application logs for detailed error information
- Review health check endpoints for system status
- Contact system administrator for access issues
- Submit bug reports through official channels

---

**Version**: 1.0.0  
**Last Updated**: January 2024  
**API Stability**: Stable