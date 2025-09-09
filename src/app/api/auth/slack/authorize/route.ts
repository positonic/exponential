import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '~/server/auth';
import { z } from 'zod';

const authorizeSchema = z.object({
  projectId: z.string().optional(),
  redirectUrl: z.string().url().optional(),
});

// Slack OAuth App credentials
const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID!;
const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

export async function GET(request: NextRequest) {
  try {
    // Get current session
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams);
    
    const { projectId, redirectUrl } = authorizeSchema.parse(params);

    // Create state parameter to maintain context
    const state = Buffer.from(JSON.stringify({
      userId: session.user.id,
      projectId,
      redirectUrl,
      timestamp: Date.now(),
    })).toString('base64');

    // Slack OAuth authorization URL
    const authUrl = new URL('https://slack.com/oauth/v2/authorize');
    authUrl.searchParams.set('client_id', SLACK_CLIENT_ID);
    authUrl.searchParams.set('scope', 'app_mentions:read,channels:read,chat:write,commands,groups:read,im:read,mpim:read,team:read,users:read,users:read.email');
    authUrl.searchParams.set('user_scope', 'identity.basic,identity.email,identity.team');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('redirect_uri', `${BASE_URL}/api/auth/slack/callback`);

    return NextResponse.redirect(authUrl.toString());

  } catch (error) {
    console.error('Slack OAuth authorization error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate Slack authorization' }, 
      { status: 500 }
    );
  }
}