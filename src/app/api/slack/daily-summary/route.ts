import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '~/server/auth';
import { api } from '~/trpc/server';
import { SlackNotificationService } from '~/server/services/notifications/SlackNotificationService';
import { db } from '~/server/db';
import { startOfDay, endOfDay, format } from 'date-fns';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { date, integrationId, channel } = body;

    // Default to today if no date provided
    const targetDate = date ? new Date(date) : new Date();
    const dayStart = startOfDay(targetDate);
    const dayEnd = endOfDay(targetDate);

    // Get completed actions for the specified date
    const completedActions = await db.action.findMany({
      where: {
        createdById: session.user.id,
        completedAt: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        completedAt: 'desc',
      },
    });

    if (completedActions.length === 0) {
      return NextResponse.json({ 
        success: false, 
        message: `No actions completed on ${format(targetDate, 'MMM d, yyyy')}` 
      });
    }

    // Find user's Slack integration if not provided
    let slackIntegrationId = integrationId;
    if (!slackIntegrationId) {
      const slackIntegration = await db.integration.findFirst({
        where: {
          userId: session.user.id,
          provider: 'slack',
          status: 'ACTIVE',
        },
      });

      if (!slackIntegration) {
        return NextResponse.json({ 
          success: false, 
          error: 'No active Slack integration found' 
        }, { status: 400 });
      }

      slackIntegrationId = slackIntegration.id;
    }

    // Format the completion summary message
    const dateString = format(targetDate, 'EEEE, MMM d, yyyy');
    const completionsByProject = completedActions.reduce((acc, action) => {
      const projectName = action.project?.name || 'Personal';
      if (!acc[projectName]) {
        acc[projectName] = [];
      }
      acc[projectName].push({
        name: action.name,
        description: action.description,
        completedAt: action.completedAt,
      });
      return acc;
    }, {} as Record<string, Array<{ name: string; description?: string | null; completedAt: Date | null }>>);

    // Build the Slack message
    const messageParts: string[] = [];
    messageParts.push(`🎉 *Daily Completion Summary for ${dateString}*`);
    messageParts.push(`Completed ${completedActions.length} action${completedActions.length !== 1 ? 's' : ''} today!\n`);

    // Group by project
    Object.entries(completionsByProject).forEach(([projectName, actions]) => {
      messageParts.push(`**📁 ${projectName}**`);
      actions.forEach((action, index) => {
        const timeStr = action.completedAt ? format(action.completedAt, 'h:mm a') : '';
        const description = action.description ? ` - ${action.description}` : '';
        messageParts.push(`  ${index + 1}. ${action.name}${description} ${timeStr ? `*(${timeStr})*` : ''}`);
      });
      messageParts.push(''); // Empty line between projects
    });

    const finalMessage = messageParts.join('\n');

    // Send via SlackNotificationService
    const slackService = new SlackNotificationService({
      userId: session.user.id,
      integrationId: slackIntegrationId,
      channel: channel || '#general',
    });

    const result = await slackService.sendNotification({
      title: `Daily Completion Summary - ${dateString}`,
      message: finalMessage,
      priority: 'normal',
      metadata: {
        completedCount: completedActions.length,
        date: targetDate.toISOString(),
        source: 'daily_summary',
        userId: session.user.id,
      },
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Successfully sent daily summary to Slack`,
        data: {
          completedActions: completedActions.length,
          date: dateString,
          messageId: result.messageId,
        },
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to send Slack notification',
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error sending daily completion summary:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}