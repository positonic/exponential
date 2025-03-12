import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // For testing different themes in development
  const requestHeaders = new Headers(request.headers);
  const testDomain = request.nextUrl.searchParams.get('theme');
  
  if (testDomain) {
    requestHeaders.set('host', `${testDomain}`);
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
} 