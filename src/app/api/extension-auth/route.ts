import { NextResponse } from 'next/server';
import { auth } from "~/server/auth";
import { getToken } from "next-auth/jwt";

export async function GET(request: Request) {
  try {
    console.log('Starting auth check...');
    const session = await auth();
    console.log('Session:', session);
    
    if (!session?.user) {
      console.log('No session user found');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('Attempting to get token...');
    const token = await getToken({ 
      req: request,
      secret: process.env.AUTH_SECRET 
    });
    console.log('Token result:', token);

    if (!token) {
      console.log('Token generation failed');
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