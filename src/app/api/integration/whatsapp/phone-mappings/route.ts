import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '~/server/auth';
import { db } from '~/server/db';
import { WhatsAppPermissionService, WhatsAppPermission } from '~/server/services/whatsapp/PermissionService';

// GET /api/integration/whatsapp/phone-mappings
// Get phone mappings for an integration (team-aware)
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const integrationId = searchParams.get('integrationId');
    
    if (!integrationId) {
      return NextResponse.json({ error: 'Integration ID required' }, { status: 400 });
    }

    // Check if user has permission to view mappings
    const hasPermission = await WhatsAppPermissionService.checkPermission(
      session.user.id,
      integrationId,
      WhatsAppPermission.MANAGE_PHONE_MAPPINGS
    );

    if (!hasPermission) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // Get mappings - will be filtered based on team membership
    const mappableUsers = await WhatsAppPermissionService.getMappableUsers(
      session.user.id,
      integrationId
    );

    const userIds = mappableUsers.map(u => u.id);

    const mappings = await db.integrationUserMapping.findMany({
      where: {
        integrationId,
        userId: { in: userIds },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    // Add role information from mappableUsers
    const enrichedMappings = mappings.map(mapping => {
      const userInfo = mappableUsers.find(u => u.id === mapping.userId);
      return {
        ...mapping,
        user: {
          ...mapping.user,
          role: userInfo?.role,
        },
      };
    });

    return NextResponse.json({ mappings: enrichedMappings });
  } catch (error) {
    console.error('Error fetching phone mappings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch phone mappings' },
      { status: 500 }
    );
  }
}

// POST /api/integration/whatsapp/phone-mappings
// Create or update a phone mapping (team-aware)
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const body = await request.json();
    const { integrationId, userId, phoneNumber } = body;

    if (!integrationId || !userId || !phoneNumber) {
      return NextResponse.json(
        { error: 'Integration ID, user ID, and phone number required' },
        { status: 400 }
      );
    }

    // Check if user can manage mappings for the target user
    const canManage = await WhatsAppPermissionService.canManagePhoneMappings(
      session.user.id,
      integrationId,
      userId
    );

    if (!canManage) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // Validate phone number format
    if (!phoneNumber.match(/^\+?[1-9]\d{1,14}$/)) {
      return NextResponse.json(
        { error: 'Invalid phone number format. Use international format (e.g., +1234567890)' },
        { status: 400 }
      );
    }

    // Check if phone number is already mapped to another user
    const existingMapping = await db.integrationUserMapping.findFirst({
      where: {
        integrationId,
        externalUserId: phoneNumber,
        NOT: { userId },
      },
    });

    if (existingMapping) {
      return NextResponse.json(
        { error: 'This phone number is already mapped to another user' },
        { status: 409 }
      );
    }

    // Create or update mapping
    const mapping = await db.integrationUserMapping.upsert({
      where: {
        integrationId_externalUserId: {
          integrationId,
          externalUserId: phoneNumber,
        },
      },
      update: {
        userId,
      },
      create: {
        integrationId,
        userId,
        externalUserId: phoneNumber,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    return NextResponse.json({ mapping });
  } catch (error) {
    console.error('Error creating phone mapping:', error);
    return NextResponse.json(
      { error: 'Failed to create phone mapping' },
      { status: 500 }
    );
  }
}

// DELETE /api/integration/whatsapp/phone-mappings
// Remove a phone mapping (team-aware)
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const integrationId = searchParams.get('integrationId');
    const userId = searchParams.get('userId');

    if (!integrationId || !userId) {
      return NextResponse.json(
        { error: 'Integration ID and user ID required' },
        { status: 400 }
      );
    }

    // Check if user can manage mappings for the target user
    const canManage = await WhatsAppPermissionService.canManagePhoneMappings(
      session.user.id,
      integrationId,
      userId
    );

    if (!canManage) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // Find and delete the mapping
    const mapping = await db.integrationUserMapping.findFirst({
      where: {
        integrationId,
        userId,
      },
    });

    if (!mapping) {
      return NextResponse.json(
        { error: 'Mapping not found' },
        { status: 404 }
      );
    }

    await db.integrationUserMapping.delete({
      where: {
        id: mapping.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing phone mapping:', error);
    return NextResponse.json(
      { error: 'Failed to remove phone mapping' },
      { status: 500 }
    );
  }
}