import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '~/server/auth';
import { notionIntegrationService } from '~/server/services/notion-integration';
import { z } from 'zod';

const callbackSchema = z.object({
  code: z.string(),
  state: z.string(),
  error: z.string().optional(),
});

// Notion OAuth App credentials
const NOTION_CLIENT_ID = process.env.NOTION_CLIENT_ID!;
const NOTION_CLIENT_SECRET = process.env.NOTION_CLIENT_SECRET!;
const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

export async function GET(request: NextRequest) {
  try {
    // Get current session
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.redirect(`${BASE_URL}/use-the-force?error=unauthorized`);
    }

    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams);
    
    const { code, state, error } = callbackSchema.parse(params);

    // Handle OAuth error
    if (error) {
      console.error('Notion OAuth error:', error);
      return NextResponse.redirect(`${BASE_URL}/settings/integrations?error=${encodeURIComponent('Notion authorization failed')}`);
    }

    // Decode state parameter
    let stateData: any;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch (error) {
      console.error('Invalid state parameter:', error);
      return NextResponse.redirect(`${BASE_URL}/settings/integrations?error=${encodeURIComponent('Invalid authorization state')}`);
    }

    // Verify state matches current user
    if (stateData.userId !== session.user.id) {
      console.error('State user ID mismatch');
      return NextResponse.redirect(`${BASE_URL}/settings/integrations?error=${encodeURIComponent('Authorization state mismatch')}`);
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${BASE_URL}/api/auth/notion/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', tokenResponse.status, errorText);
      return NextResponse.redirect(`${BASE_URL}/settings/integrations?error=${encodeURIComponent('Failed to get Notion access token')}`);
    }

    const tokenData = await tokenResponse.json();

    // Get workspace information
    const workspaceResponse = await fetch('https://api.notion.com/v1/users/me', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Notion-Version': '2022-06-28',
      },
    });

    if (!workspaceResponse.ok) {
      const errorText = await workspaceResponse.text();
      console.error('Failed to get workspace info:', workspaceResponse.status, errorText);
      return NextResponse.redirect(`${BASE_URL}/settings/integrations?error=${encodeURIComponent('Failed to get Notion workspace information')}`);
    }

    // const workspaceData = await workspaceResponse.json(); // Currently unused

    // Create Notion integration using the service
    await notionIntegrationService.createNotionIntegration(session.user.id, {
      accessToken: tokenData.access_token,
      tokenType: tokenData.token_type,
      workspaceId: tokenData.workspace_id,
      workspaceName: tokenData.workspace_name,
      workspaceIcon: tokenData.workspace_icon,
      botId: tokenData.bot_id,
      owner: tokenData.owner,
      duplicatedTemplateId: tokenData.duplicated_template_id,
      projectId: stateData.projectId,
      appWorkspaceId: stateData.workspaceId,
    });

    // Determine redirect URL (ensure it's absolute)
    const redirectPath = stateData.redirectUrl || '/settings/integrations';
    const redirectUrl = redirectPath.startsWith('http') ? redirectPath : `${BASE_URL}${redirectPath}`;
    const successMessage = `Successfully connected Notion workspace: ${tokenData.workspace_name}`;

    return NextResponse.redirect(
      `${redirectUrl}?success=${encodeURIComponent(successMessage)}`
    );

  } catch (error) {
    console.error('Notion OAuth callback error:', error);
    return NextResponse.redirect(
      `${BASE_URL}/settings/integrations?error=${encodeURIComponent('Notion integration setup failed')}`
    );
  }
}