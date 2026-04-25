# WhatsApp Business API Integration Setup Guide

## Overview

This guide provides step-by-step instructions to set up the WhatsApp Business API integration with your task management system. The integration enables users to interact with their tasks, projects, and AI assistant through WhatsApp messages.

## Prerequisites

### 1. WhatsApp Business Account Requirements
- **Meta Business Account**: Active Meta Business Manager account
- **WhatsApp Business Account**: Verified WhatsApp Business Account
- **Phone Number**: Dedicated phone number for WhatsApp Business API
- **Business Verification**: Completed business verification process

### 2. Technical Requirements
- **Node.js**: Version 18+ with npm/yarn
- **Database**: PostgreSQL database instance
- **Redis**: Redis instance for caching (optional but recommended)
- **SSL Certificate**: Valid SSL certificate for webhook endpoints
- **Domain**: Public domain with HTTPS support

### 3. API Access
- **Meta Developer Account**: Access to Meta for Developers platform
- **WhatsApp Business API**: Approved access to WhatsApp Business API
- **App Permissions**: Required permissions for messaging and webhooks

## Step 1: Meta Developer Setup

### 1.1 Create Meta App
1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Click "Create App" and select "Business" as app type
3. Fill in app details:
   - **App Name**: Your application name
   - **Business Account**: Select your Meta Business Account
4. Click "Create App"

### 1.2 Add WhatsApp Product
1. In your app dashboard, click "Add a product"
2. Find "WhatsApp" and click "Set up"
3. Select your WhatsApp Business Account
4. Complete the WhatsApp Business API setup

### 1.3 Generate Access Tokens
1. Navigate to WhatsApp > Getting Started
2. Generate a **temporary access token** for testing
3. For production, create a **permanent access token**:
   - Go to WhatsApp > Configuration
   - Create a System User with appropriate permissions
   - Generate an access token for the System User

### 1.4 Get Essential IDs
Record the following important IDs:
- **App ID**: Found in App Settings > Basic
- **Business Account ID**: Found in WhatsApp > Getting Started
- **Phone Number ID**: Found in WhatsApp > Getting Started
- **WABA ID**: Your WhatsApp Business Account ID

## Step 2: Webhook Configuration

### 2.1 Set Webhook URL
1. In Meta Developer Console, go to WhatsApp > Configuration
2. Set Webhook URL to: `https://yourdomain.com/api/webhooks/whatsapp`
3. Set Verify Token (create a secure random string)
4. Subscribe to webhook fields:
   - `messages`
   - `message_template_status_update`
   - `phone_number_name_update`

### 2.2 Verify Webhook
The system will automatically handle webhook verification when you save the webhook URL in Meta's console.

## Step 3: Application Setup

### 3.1 Environment Variables
Add the following environment variables to your `.env` file:

```bash
# WhatsApp Business API Configuration
WHATSAPP_ACCESS_TOKEN=your_permanent_access_token
WHATSAPP_VERIFY_TOKEN=your_webhook_verify_token
WHATSAPP_APP_ID=your_app_id
WHATSAPP_APP_SECRET=your_app_secret

# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/your_db

# Redis Configuration (Optional)
REDIS_URL=redis://localhost:6379

# Application Configuration
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=https://yourdomain.com
```

### 3.2 Database Migration
Run database migrations to create WhatsApp-specific tables:

```bash
npx prisma db push
npx prisma generate
```

### 3.3 Install Dependencies
Ensure all required dependencies are installed:

```bash
npm install
# or
yarn install
```

## Step 4: Create WhatsApp Integration

### 4.1 Access Integration Settings
1. Log into your application
2. Navigate to **Integrations** section
3. Click **Add Integration** or **WhatsApp Integration**

### 4.2 Configure Integration
Fill in the integration form with:
- **Integration Name**: Descriptive name for your integration
- **Business Account ID**: Your WABA ID from Step 1.4
- **Phone Number ID**: Your Phone Number ID from Step 1.4
- **Display Phone Number**: The actual phone number (optional)
- **Business Name**: Your business name (optional)

### 4.3 Add Credentials
The system will prompt you to add:
1. **Access Token**: Your permanent access token
2. **Webhook Verify Token**: The token you set in webhook configuration
3. **App Secret**: Your app secret for signature verification

## Step 5: Phone Number Mapping

### 5.1 Map Users to Phone Numbers
1. Go to **WhatsApp Integration Settings**
2. Click **Manage Phone Mappings**
3. Add user mappings:
   - **User**: Select system user
   - **Phone Number**: User's WhatsApp number (international format)
   - **Integration**: Select your WhatsApp integration

### 5.2 Test User Mapping
Send a test message from a mapped phone number to verify the setup.

## Step 6: Testing and Verification

### 6.1 Send Test Message
1. In integration settings, click **Send Test Message**
2. Enter a mapped phone number
3. Send a test message
4. Verify message is received on WhatsApp

### 6.2 Test Incoming Messages
1. Send a message from WhatsApp to your business number
2. Check application logs for message processing
3. Verify AI assistant responds appropriately

### 6.3 Health Check
Access the health check endpoint to verify system status:
```
GET https://yourdomain.com/api/webhooks/whatsapp/health
```

## Step 7: Production Deployment

### 7.1 Production Checklist
- [ ] **SSL Certificate**: Valid SSL certificate installed
- [ ] **Webhook URL**: Production webhook URL configured
- [ ] **Access Tokens**: Permanent tokens (not temporary)
- [ ] **Rate Limits**: Understand WhatsApp API rate limits
- [ ] **Monitoring**: Set up monitoring and alerts
- [ ] **Backup**: Database backup strategy in place

### 7.2 Go Live Process
1. **Business Verification**: Complete Meta business verification
2. **API Review**: Submit for WhatsApp API review (if required)
3. **Phone Number Approval**: Get phone number approved for messaging
4. **Template Approval**: Submit and approve message templates
5. **Production Testing**: Conduct thorough testing in production

## Troubleshooting

### Common Issues

#### Webhook Verification Failed
- **Cause**: Incorrect verify token or URL
- **Solution**: Ensure verify token matches in both Meta console and application

#### Messages Not Received
- **Cause**: Phone number not mapped or webhook not configured
- **Solution**: Verify phone number mapping and webhook subscription

#### API Rate Limits
- **Cause**: Exceeding WhatsApp API rate limits
- **Solution**: Implement rate limiting and respect API quotas

#### Authentication Errors
- **Cause**: Invalid or expired access token
- **Solution**: Generate new permanent access token

### Debug Tools

#### Application Logs
Check application logs for detailed error information:
```bash
npm run dev:log
tail -f todo.log
```

#### Health Check Endpoint
Monitor system health:
```bash
curl https://yourdomain.com/api/webhooks/whatsapp/health
```

#### Worker Status
Check message queue status:
```bash
curl https://yourdomain.com/api/workers/whatsapp
```

## Support and Resources

### Documentation Links
- [WhatsApp Business API Documentation](https://developers.facebook.com/docs/whatsapp)
- [Meta for Developers](https://developers.facebook.com/)
- [Application API Reference](./API_REFERENCE.md)

### Getting Help
- Check application logs for detailed error messages
- Review WhatsApp Business API documentation
- Contact system administrator for technical support
- Review Meta's troubleshooting guides

## Security Considerations

- **Never expose** access tokens or app secrets
- **Use HTTPS** for all webhook endpoints
- **Validate** all incoming webhook signatures
- **Implement** rate limiting to prevent abuse
- **Monitor** for suspicious activity and unauthorized access
- **Regularly rotate** access tokens and credentials
- **Follow** WhatsApp Business Policy and Terms of Service

---

**Next Steps**: After completing setup, refer to the [User Guide](./USER_GUIDE.md) for information on using the WhatsApp integration features.