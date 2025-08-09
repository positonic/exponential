# WhatsApp Integration PRD

## Executive Summary

This document outlines the requirements for implementing a WhatsApp Business API integration for the Exponential productivity platform. The integration will mirror the functionality of the existing Slack integration, enabling users to interact with their productivity data through WhatsApp messages, receive notifications, and manage tasks through natural conversation with the AI assistant "Paddy".

## 1. Background & Context

### Current State
The Exponential platform currently supports Slack integration with the following capabilities:
- OAuth-based authentication flow
- Bidirectional message handling (send/receive)
- AI assistant integration ("Paddy")
- Channel configuration and management
- User authorization and team management
- Interactive components and slash commands
- Message history tracking and analytics
- Notification services for project/task updates

### Business Objectives
1. **Expand Communication Channels**: Provide users with WhatsApp as an alternative communication channel for productivity management
2. **Global Reach**: Leverage WhatsApp's 2+ billion user base to increase platform accessibility
3. **Mobile-First Experience**: Enable seamless productivity management through mobile-native WhatsApp interface
4. **User Choice**: Allow users to choose their preferred communication platform (Slack or WhatsApp)

### Success Metrics
- User adoption rate of WhatsApp integration
- Message volume and engagement metrics
- Task completion rates via WhatsApp
- User satisfaction scores
- API performance and reliability metrics

## 2. Technical Overview

### WhatsApp Cloud API vs Slack API Comparison

| Feature | Slack API | WhatsApp Cloud API | Implementation Impact |
|---------|-----------|-------------------|----------------------|
| **Authentication** | OAuth 2.0 | Access Tokens | Similar patterns, different providers |
| **Webhooks** | Event API + Interactive Components | Message webhooks only | Simpler webhook handling |
| **Message Types** | Text, Blocks, Attachments | Text, Media, Templates, Interactive | Different UI components |
| **Channels** | Public/Private channels | Individual conversations | 1:1 conversation model |
| **Bot Commands** | Slash commands | Natural language only | AI-first interaction |
| **Pricing** | Free for most use cases | Free first 1000 conversations/month | Need cost monitoring |

### Key Technical Differences
1. **Conversation Model**: WhatsApp uses 1:1 conversations vs Slack's channel-based model
2. **Message Templates**: WhatsApp requires pre-approved templates for business-initiated messages
3. **No Native Commands**: WhatsApp doesn't support slash commands - all interaction is natural language
4. **Business Verification**: Requires Facebook Business verification process
5. **Rate Limiting**: Different rate limit structure compared to Slack

## 3. Functional Requirements

### 3.1 Authentication & Setup

#### WhatsApp Business Account Setup
- **FR-WA-001**: System must support WhatsApp Business Account integration
- **FR-WA-002**: Integration flow must guide users through Facebook Business Manager setup
- **FR-WA-003**: Phone number verification must be completed before activation
- **FR-WA-004**: Business verification status must be tracked and validated

#### OAuth Integration Flow
- **FR-WA-005**: Implement WhatsApp OAuth flow using Facebook Graph API
- **FR-WA-006**: Store access tokens securely with encryption
- **FR-WA-007**: Handle token refresh and expiration automatically
- **FR-WA-008**: Support multiple WhatsApp Business accounts per user

### 3.2 Message Handling

#### Incoming Message Processing
- **FR-WA-009**: Receive and process incoming WhatsApp messages via webhooks
- **FR-WA-010**: Implement webhook signature verification for security
- **FR-WA-011**: Handle all supported message types (text, media, location, contacts)
- **FR-WA-012**: Implement message deduplication to prevent duplicate processing
- **FR-WA-013**: Map WhatsApp phone numbers to system users

#### Outgoing Message Sending
- **FR-WA-014**: Send text responses to users through WhatsApp
- **FR-WA-015**: Support rich media responses (images, documents, audio)
- **FR-WA-016**: Implement message templates for business-initiated conversations
- **FR-WA-017**: Handle message delivery status tracking
- **FR-WA-018**: Implement rate limiting and retry logic

### 3.3 AI Assistant Integration

#### Paddy AI Integration
- **FR-WA-019**: Enable natural language conversations with Paddy AI assistant
- **FR-WA-020**: Support the same AI capabilities as Slack (goals, projects, tasks)
- **FR-WA-021**: Implement context-aware responses based on user history
- **FR-WA-022**: Handle multi-turn conversations with state management

#### Message Processing
- **FR-WA-023**: Categorize incoming messages by intent (goals, projects, actions, general)
- **FR-WA-024**: Format AI responses optimally for WhatsApp display
- **FR-WA-025**: Implement conversation memory and context tracking
- **FR-WA-026**: Handle error states and fallback responses

### 3.4 User Management & Authorization

#### User Authentication
- **FR-WA-027**: Link WhatsApp phone numbers to existing Exponential user accounts
- **FR-WA-028**: Implement secure user verification process
- **FR-WA-029**: Support team-based access controls
- **FR-WA-030**: Handle unauthorized access attempts with registration flow

#### Permission Management
- **FR-WA-031**: Implement role-based access controls for WhatsApp integration
- **FR-WA-032**: Support team-wide WhatsApp integration permissions
- **FR-WA-033**: Allow integration administrators to manage user access
- **FR-WA-034**: Track and audit WhatsApp integration usage

### 3.5 Notification Services

#### Proactive Notifications
- **FR-WA-035**: Send task reminders and deadlines via WhatsApp
- **FR-WA-036**: Notify users of project updates and status changes
- **FR-WA-037**: Support daily/weekly productivity summaries
- **FR-WA-038**: Implement notification preferences and scheduling

#### Template Management
- **FR-WA-039**: Manage WhatsApp message templates through admin interface
- **FR-WA-040**: Support template approval workflow with Facebook
- **FR-WA-041**: Track template usage and performance metrics
- **FR-WA-042**: Handle template rejection and resubmission process

### 3.6 Analytics & Monitoring

#### Message Analytics
- **FR-WA-043**: Track message volume, response times, and engagement metrics
- **FR-WA-044**: Monitor AI assistant performance and accuracy
- **FR-WA-045**: Generate usage reports for administrators
- **FR-WA-046**: Track conversation completion rates and user satisfaction

#### System Monitoring
- **FR-WA-047**: Monitor API rate limits and quota usage
- **FR-WA-048**: Track webhook delivery success rates
- **FR-WA-049**: Implement alerting for integration failures
- **FR-WA-050**: Monitor business verification status changes

## 4. Non-Functional Requirements

### 4.1 Performance
- **NFR-WA-001**: Webhook processing must complete within 20 seconds
- **NFR-WA-002**: Message delivery success rate must exceed 99.5%
- **NFR-WA-003**: AI response time must be under 10 seconds
- **NFR-WA-004**: System must handle 10,000+ messages per day per integration

### 4.2 Security
- **NFR-WA-005**: All webhook payloads must be cryptographically verified
- **NFR-WA-006**: Access tokens must be encrypted at rest and in transit
- **NFR-WA-007**: User data privacy must comply with WhatsApp Business Policy
- **NFR-WA-008**: Implement comprehensive audit logging for all WhatsApp interactions

### 4.3 Reliability
- **NFR-WA-009**: System must handle WhatsApp API downtime gracefully
- **NFR-WA-010**: Implement exponential backoff for failed message sends
- **NFR-WA-011**: Message processing must be idempotent
- **NFR-WA-012**: Support failover and redundancy for critical components

### 4.4 Scalability
- **NFR-WA-013**: Architecture must support horizontal scaling
- **NFR-WA-014**: Database design must handle high message volumes
- **NFR-WA-015**: Webhook processing must be horizontally scalable
- **NFR-WA-016**: Support multi-region deployment for global users

## 5. Technical Implementation

### 5.1 Database Schema Extensions

#### New Models Required
```typescript
// WhatsApp-specific models extending existing integration pattern
model WhatsAppConfig {
  id                    String   @id @default(cuid())
  whatsAppPhoneNumber   String   @unique  // Business phone number
  displayName           String             // Business display name
  isActive              Boolean  @default(true)
  integrationId         String             // Links to Integration model
  
  // Business verification
  businessVerificationStatus String // "PENDING", "APPROVED", "REJECTED"
  verificationDate      DateTime?
  
  // Template management
  messageTemplates      WhatsAppTemplate[]
  
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
}

model WhatsAppTemplate {
  id                String   @id @default(cuid())
  whatsAppConfigId  String
  templateName      String
  category          String   // "UTILITY", "MARKETING", "AUTHENTICATION"
  language          String
  status            String   // "PENDING", "APPROVED", "REJECTED"
  template          Json     // Template structure
  
  config            WhatsAppConfig @relation(fields: [whatsAppConfigId], references: [id])
}

model WhatsAppMessageHistory {
  id                String   @id @default(cuid())
  whatsAppConfigId  String
  messageId         String   // WhatsApp message ID
  phoneNumber       String   // User's phone number
  systemUserId      String?  // Mapped system user
  direction         String   // "INBOUND", "OUTBOUND"
  messageType       String   // "TEXT", "IMAGE", "DOCUMENT", etc.
  content           Json     // Message content
  status            String   // "SENT", "DELIVERED", "READ", "FAILED"
  
  // AI Processing
  aiProcessed       Boolean  @default(false)
  agentUsed         String?
  responseTime      Int?
  category          String?
  intent            String?
  
  createdAt         DateTime @default(now())
}

model WhatsAppUserMapping {
  id                String   @id @default(cuid())
  whatsAppConfigId  String
  phoneNumber       String   @unique
  systemUserId      String
  verifiedAt        DateTime?
  isActive          Boolean  @default(true)
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

### 5.2 API Endpoints

#### WhatsApp Integration Router
```typescript
// src/server/api/routers/whatsapp.ts
export const whatsappRouter = createTRPCRouter({
  // Configuration
  getConfig: protectedProcedure.query(async ({ ctx }) => { /* ... */ }),
  updateConfig: protectedProcedure.input(updateConfigSchema).mutation(async ({ ctx, input }) => { /* ... */ }),
  
  // Template Management
  getTemplates: protectedProcedure.query(async ({ ctx }) => { /* ... */ }),
  createTemplate: protectedProcedure.input(templateSchema).mutation(async ({ ctx, input }) => { /* ... */ }),
  
  // Message History
  getMessageHistory: protectedProcedure.input(messageHistorySchema).query(async ({ ctx, input }) => { /* ... */ }),
  getMessageStats: protectedProcedure.query(async ({ ctx }) => { /* ... */ }),
  
  // User Management
  getUserMappings: protectedProcedure.query(async ({ ctx }) => { /* ... */ }),
  verifyUserPhone: protectedProcedure.input(phoneVerificationSchema).mutation(async ({ ctx, input }) => { /* ... */ }),
  
  // Testing
  testConnection: protectedProcedure.query(async ({ ctx }) => { /* ... */ }),
  sendTestMessage: protectedProcedure.input(testMessageSchema).mutation(async ({ ctx, input }) => { /* ... */ }),
});
```

#### Webhook Handler
```typescript
// src/app/api/webhooks/whatsapp/route.ts
export async function POST(request: NextRequest) {
  // 1. Verify webhook signature
  // 2. Parse WhatsApp payload
  // 3. Route to appropriate handler
  // 4. Process message through AI system
  // 5. Send response if needed
  // 6. Log interaction
}

export async function GET(request: NextRequest) {
  // Handle webhook verification challenge
}
```

### 5.3 Service Layer

#### WhatsApp Notification Service
```typescript
// src/server/services/notifications/WhatsAppNotificationService.ts
export class WhatsAppNotificationService extends NotificationService {
  async sendNotification(payload: NotificationPayload): Promise<NotificationResult>
  async sendMessage(phoneNumber: string, message: string): Promise<NotificationResult>
  async sendMediaMessage(phoneNumber: string, mediaUrl: string, caption?: string): Promise<NotificationResult>
  async sendTemplateMessage(phoneNumber: string, templateName: string, parameters: any[]): Promise<NotificationResult>
  async getDeliveryStatus(messageId: string): Promise<MessageStatus>
  async validateConfig(): Promise<ValidationResult>
  async testConnection(): Promise<ConnectionResult>
}
```

#### WhatsApp Message Processor
```typescript
// src/server/services/processors/WhatsAppMessageProcessor.ts
export class WhatsAppMessageProcessor {
  async processIncomingMessage(payload: WhatsAppWebhookPayload): Promise<void>
  async processStatusUpdate(payload: WhatsAppStatusPayload): Promise<void>
  private async mapPhoneToUser(phoneNumber: string): Promise<User | null>
  private async sendAIResponse(phoneNumber: string, message: string, user: User): Promise<void>
  private async logMessageHistory(data: MessageHistoryData): Promise<void>
}
```

### 5.4 Frontend Components

#### WhatsApp Integration Settings
```typescript
// src/app/_components/WhatsAppIntegrationSettings.tsx
export function WhatsAppIntegrationSettings() {
  // Configuration interface for WhatsApp integration
  // Template management
  // User mapping management
  // Analytics dashboard
}
```

#### WhatsApp Setup Flow
```typescript
// src/app/_components/WhatsAppSetupFlow.tsx
export function WhatsAppSetupFlow() {
  // Step-by-step setup wizard
  // Business verification status
  // Phone number configuration
  // Testing interface
}
```

## 6. Implementation Phases

### Phase 1: Core Integration (4-6 weeks)
1. **Week 1-2**: Database schema design and basic infrastructure
2. **Week 3-4**: Webhook handling and message processing
3. **Week 5-6**: AI assistant integration and basic responses

**Deliverables:**
- Basic WhatsApp message sending/receiving
- Webhook verification and security
- Simple AI responses through Paddy

### Phase 2: Advanced Features (4-5 weeks)
1. **Week 7-8**: Template management and approval workflow
2. **Week 9-10**: User mapping and authorization
3. **Week 11**: Notification services integration

**Deliverables:**
- Message template system
- User authentication and mapping
- Proactive notifications

### Phase 3: Analytics & Administration (3-4 weeks)
1. **Week 12-13**: Analytics dashboard and reporting
2. **Week 14-15**: Admin interfaces and management tools

**Deliverables:**
- Message analytics and reporting
- Admin configuration interfaces
- Performance monitoring

### Phase 4: Testing & Launch (2-3 weeks)
1. **Week 16-17**: Comprehensive testing and bug fixes
2. **Week 18**: Production deployment and monitoring

**Deliverables:**
- Fully tested integration
- Production deployment
- Documentation and training

## 7. Risk Assessment

### Technical Risks
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| WhatsApp API rate limiting | High | Medium | Implement robust rate limiting and queuing |
| Business verification delays | High | High | Start verification process early, have fallback plan |
| Message template rejections | Medium | Medium | Follow WhatsApp guidelines, iterative approval process |
| Webhook reliability issues | Medium | Low | Implement retry logic and monitoring |

### Business Risks
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Low user adoption | High | Medium | User research, gradual rollout, training |
| WhatsApp policy changes | High | Low | Stay updated with policies, flexible architecture |
| Cost escalation | Medium | Medium | Monitor usage, implement cost controls |
| Security vulnerabilities | High | Low | Security audits, best practices |

## 8. Success Criteria

### Launch Criteria
- [ ] WhatsApp Business verification completed
- [ ] Core message sending/receiving functional
- [ ] AI assistant integration working
- [ ] Security testing passed
- [ ] Performance testing passed
- [ ] Documentation completed

### Post-Launch Metrics (First 90 days)
- **Adoption**: 25% of active users try WhatsApp integration
- **Engagement**: 60% of users who try it send 10+ messages
- **Performance**: 99.5% message delivery success rate
- **AI Quality**: 85% positive feedback on AI responses
- **Reliability**: 99.9% webhook uptime

## 9. Dependencies

### External Dependencies
- Facebook Business Manager approval
- WhatsApp Business Account verification
- Meta Developer Platform access
- SSL certificate for webhooks

### Internal Dependencies
- Existing AI assistant (Paddy) infrastructure
- Notification service architecture
- User authentication system
- Database migration capabilities

## 10. Resources Required

### Development Team
- 1 Senior Backend Developer (lead)
- 1 Frontend Developer
- 1 DevOps Engineer (part-time)
- 1 QA Engineer (part-time)
- 1 Product Manager (oversight)

### Infrastructure
- Additional server capacity for webhook processing
- Database scaling for message storage
- Monitoring and alerting tools
- Development and staging environments

### Budget Considerations
- WhatsApp API costs (after free tier)
- Additional infrastructure costs
- Facebook Business verification fees
- Testing phone numbers and accounts

## 11. Conclusion

The WhatsApp integration will provide Exponential users with a mobile-first, globally accessible way to manage their productivity through natural conversation. By mirroring the successful Slack integration patterns while adapting to WhatsApp's unique characteristics, this integration will expand the platform's reach and provide users with flexible communication options.

The phased approach ensures manageable development while delivering value incrementally. Success depends on careful attention to WhatsApp's business requirements, robust technical implementation, and user-centered design that makes productivity management as simple as sending a text message.

---

*Document Version: 1.0*  
*Last Updated: [Current Date]*  
*Next Review: [30 days from creation]*