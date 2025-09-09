import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '~/server/auth';
import { db } from '~/server/db';
import { z } from 'zod';

const callbackSchema = z.object({
  code: z.string(),
  state: z.string(),
  error: z.string().optional(),
});

// Slack OAuth App credentials
const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID!;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET!;
const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

export async function GET(request: NextRequest) {
  try {
    // Get current session
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.redirect('/use-the-force?error=unauthorized');
    }

    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams);
    
    const { code, state, error } = callbackSchema.parse(params);

    // Handle OAuth error
    if (error) {
      console.error('Slack OAuth error:', error);
      return NextResponse.redirect(`/integrations?error=${encodeURIComponent('Slack authorization failed')}`);
    }

    // Decode state parameter
    let stateData: any;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch (error) {
      console.error('Invalid state parameter:', error);
      return NextResponse.redirect(`/integrations?error=${encodeURIComponent('Invalid authorization state')}`);
    }

    // Verify state matches current user
    if (stateData.userId !== session.user.id) {
      console.error('State user ID mismatch');
      return NextResponse.redirect(`/integrations?error=${encodeURIComponent('Authorization state mismatch')}`);
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: SLACK_CLIENT_ID,
        client_secret: SLACK_CLIENT_SECRET,
        code,
        redirect_uri: `${BASE_URL}/api/auth/slack/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', tokenResponse.status, errorText);
      return NextResponse.redirect(`/integrations?error=${encodeURIComponent('Failed to get Slack access token')}`);
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.ok) {
      console.error('Slack API error:', tokenData.error);
      return NextResponse.redirect(`/integrations?error=${encodeURIComponent(`Slack API error: ${tokenData.error}`)}`);
    }

    // Create Slack integration
    const integration = await db.integration.create({
      data: {
        name: `Slack - ${tokenData.team.name}`,
        type: 'oauth',
        provider: 'slack',
        status: 'ACTIVE',
        description: `Slack workspace integration for ${tokenData.team.name}`,
        userId: session.user.id,
        lastSyncAt: new Date(),
      },
    });

    // Store access token as encrypted credential
    await db.integrationCredential.create({
      data: {
        integrationId: integration.id,
        key: tokenData.access_token,
        keyType: 'access_token',
        isEncrypted: true,
      },
    });

    // Store Slack metadata
    await db.integrationCredential.create({
      data: {
        integrationId: integration.id,
        key: JSON.stringify({
          tokenType: tokenData.token_type,
          scope: tokenData.scope,
          botUserId: tokenData.bot_user_id,
          appId: tokenData.app_id,
          teamId: tokenData.team.id,
          teamName: tokenData.team.name,
          authedUser: tokenData.authed_user,
          incomingWebhook: tokenData.incoming_webhook,
          enterprise: tokenData.enterprise,
        }),
        keyType: 'slack_metadata',
        isEncrypted: false,
      },
    });

    // Determine redirect URL
    const redirectUrl = stateData.redirectUrl || '/integrations';
    const successMessage = `Successfully connected Slack workspace: ${tokenData.team.name}`;
    
    return NextResponse.redirect(
      `${redirectUrl}?success=${encodeURIComponent(successMessage)}`
    );

  } catch (error) {
    console.error('Slack OAuth callback error:', error);
    return NextResponse.redirect(
      `/integrations?error=${encodeURIComponent('Slack integration setup failed')}`
    );
  }
}