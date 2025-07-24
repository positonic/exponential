import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '~/server/auth';

export async function middleware(request: NextRequest) {
  // For testing different themes in development
  const requestHeaders = new Headers(request.headers);
  const testDomain = request.nextUrl.searchParams.get('theme');
  
  if (testDomain) {
    requestHeaders.set('host', `${testDomain}`);
  }

  // Handle authentication for protected routes
  const { pathname } = request.nextUrl;
  
  // Define protected routes that require authentication
  const protectedRoutes = [
    '/home',
    '/inbox', 
    '/today',
    '/projects',
    '/goals',
    '/outcomes',
    '/integrations',
    '/workflows',
    '/journal',
    '/meetings',
    '/videos',
    '/tokens',
    '/days',
    '/recordings',
    '/multi-agent',
    '/agent',
    '/actions',
    '/docs',
    '/features',
    '/roadmap',
    '/privacy',
    '/terms'
  ];

  // Skip authentication check for certain paths
  const publicPaths = ['/', '/use-the-force'];
  const isPublicPath = publicPaths.some(path => pathname === path);
  
  // Check if the current path is a protected route
  const isProtectedRoute = protectedRoutes.some(route => 
    pathname.startsWith(route) || pathname === route
  );

  if (isProtectedRoute && !isPublicPath) {
    // Get the session
    const session = await auth();
    
    // If no session, redirect to login
    if (!session?.user) {
      const loginUrl = new URL('/use-the-force', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - use-the-force (login page)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|use-the-force).*)',
  ],
}; 