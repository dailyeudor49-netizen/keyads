import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      new URL(`/setup?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/setup?error=no_code', request.url)
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL('/setup?error=missing_credentials', request.url)
    );
  }

  // Determina il redirect URI
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  const redirectUri = `${baseUrl}/api/auth/callback`;

  try {
    // Scambia il code per i token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      return NextResponse.redirect(
        new URL(`/setup?error=${encodeURIComponent(tokenData.error)}`, request.url)
      );
    }

    // Mostra il refresh token all'utente
    const refreshToken = tokenData.refresh_token;

    if (!refreshToken) {
      return NextResponse.redirect(
        new URL('/setup?error=no_refresh_token', request.url)
      );
    }

    // Redirect alla pagina setup con il token
    return NextResponse.redirect(
      new URL(`/setup?refresh_token=${encodeURIComponent(refreshToken)}`, request.url)
    );
  } catch (err) {
    console.error('Errore OAuth:', err);
    return NextResponse.redirect(
      new URL('/setup?error=token_exchange_failed', request.url)
    );
  }
}
