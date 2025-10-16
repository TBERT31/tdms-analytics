import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const API_GATEWAY_URL = process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'http://localhost:3001';

const PUBLIC_ROUTES = ['/api/health'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  try {
    const cookieHeader = request.headers.get('cookie') || '';
    
    const response = await fetch(`${API_GATEWAY_URL}/auth/check-session`, {
      method: 'GET',
      headers: {
        'Cookie': cookieHeader,
      },
      credentials: 'include',
    });

    if (response.ok) {
      const data = await response.json();
      
      if (data.isAuthenticated && data.user) {
        const userRoles = data.user.userinfo?.roles || [];
   
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set('x-user-info', JSON.stringify(data.user));
        
        return NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
      }
    }
    
    return NextResponse.redirect(new URL(`${API_GATEWAY_URL}/auth/login`, request.url));
    
  } catch (error) {
    console.error('Erreur lors de la vérification de session:', error);
    return NextResponse.redirect(new URL(`${API_GATEWAY_URL}/auth/login`, request.url));
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};