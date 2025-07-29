import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '~/server/auth';
import { api } from '~/trpc/server';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      console.error('No authenticated user for Slack callback');
      return NextResponse.redirect(new URL('/use-the-force?error=auth_required', request.url));
    }

    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle OAuth errors
    if (error) {
      console.error('Slack OAuth error:', error);
      const errorMessage = encodeURIComponent(`Slack authorization failed: ${error}`);
      return NextResponse.redirect(new URL(`/integrations?error=${errorMessage}`, request.url));
    }

    // Validate required parameters
    if (!code || !state) {
      console.error('Missing code or state in Slack callback');
      return NextResponse.redirect(new URL('/integrations?error=invalid_callback', request.url));
    }

    // Verify state matches user ID for security
    if (state !== session.user.id) {
      console.error('State mismatch in Slack callback');
      return NextResponse.redirect(new URL('/integrations?error=state_mismatch', request.url));
    }

    try {
      // Exchange the code for tokens using our tRPC endpoint
      const oauthResult = await api.integration.handleSlackCallback({
        code,
        state
      });

      // Create the Slack integration with the OAuth data
      const integration = await api.integration.createSlackIntegration({
        name: `${oauthResult.team.name} Workspace`,
        description: `Slack integration for ${oauthResult.team.name}`,
        botToken: oauthResult.botToken,
        userToken: oauthResult.accessToken,
        signingSecret: process.env.SLACK_SIGNING_SECRET || '', // We'll need to get this from environment
        slackTeamId: oauthResult.team.id,
        teamName: oauthResult.team.name,
        appId: oauthResult.appId, // Add app ID from OAuth response
      });

      console.log('✅ Slack integration created successfully:', integration.integration.id);
      
      // Redirect back to integrations page with success message
      const successMessage = encodeURIComponent(`Successfully connected to ${oauthResult.team.name}`);
      return NextResponse.redirect(new URL(`/integrations?success=${successMessage}`, request.url));

    } catch (integrationError) {
      console.error('Failed to create Slack integration:', integrationError);
      const errorMessage = encodeURIComponent('Failed to complete Slack integration setup');
      return NextResponse.redirect(new URL(`/integrations?error=${errorMessage}`, request.url));
    }

  } catch (error) {
    console.error('Slack OAuth callback error:', error);
    const errorMessage = encodeURIComponent('An error occurred during Slack authorization');
    return NextResponse.redirect(new URL(`/integrations?error=${errorMessage}`, request.url));
  }
}