import { NextResponse } from 'next/server';
import { auth } from "~/server/auth";
import jwt from 'jsonwebtoken';

export async function GET() {
  try {
    const session = await auth();
    console.log('Session:', session); // Debug log

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!process.env.AUTH_SECRET) {
      console.error('AUTH_SECRET is not set');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Generate a short-lived JWT token with minimal user info
    try {
      const token = jwt.sign(
        {
          userId: session.user.id,
          email: session.user.email,
        },
        process.env.AUTH_SECRET,
        {
          expiresIn: '5m', // Short 5-minute lifespan
        }
      );

      // Return the token as JSON
      return NextResponse.json({ token });
    } catch (jwtError) {
      console.error('JWT signing error:', jwtError);
      return NextResponse.json(
        { error: 'Token generation failed' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Extension auth error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 