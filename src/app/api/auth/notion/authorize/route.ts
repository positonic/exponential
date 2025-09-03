import { NextRequest, NextResponse } from 'next/server';
import { auth } from '~/server/auth';
import { z } from 'zod';

const authorizeSchema = z.object({
  projectId: z.string().optional(),
  redirectUrl: z.string().url().optional(),
});

// Notion OAuth App credentials
const NOTION_CLIENT_ID = process.env.NOTION_CLIENT_ID!;
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

    // Notion OAuth authorization URL
    const authUrl = new URL('https://api.notion.com/v1/oauth/authorize');
    authUrl.searchParams.set('client_id', NOTION_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('owner', 'user');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('redirect_uri', `${BASE_URL}/api/auth/notion/callback`);

    return NextResponse.redirect(authUrl.toString());

  } catch (error) {
    console.error('Notion OAuth authorization error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate Notion authorization' }, 
      { status: 500 }
    );
  }
}