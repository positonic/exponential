/**
 * @deprecated Use POST /api/auth/extension-token instead.
 * This endpoint returns the raw NextAuth token object, not a usable JWT for API calls.
 * The new endpoint generates a proper Bearer JWT that works with tRPC endpoints.
 */
import { NextResponse } from 'next/server';
import { auth } from "~/server/auth";
import { getToken } from "next-auth/jwt";

export async function GET(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = await getToken({ 
      req: request,
      secret: process.env.AUTH_SECRET 
    });

    if (!token) {
      return NextResponse.json(
        { error: 'Token generation failed' },
        { status: 500 }
      );
    }

    // Return the token as JSON
    return NextResponse.json({ token });

  } catch (error) {
    console.error('Extension auth error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 