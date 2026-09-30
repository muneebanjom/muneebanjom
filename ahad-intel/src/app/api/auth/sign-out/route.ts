import { NextResponse } from 'next/server';
import { destroySession, getSession } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { env } from '@/lib/env';

export async function POST(): Promise<NextResponse> {
  const session = await getSession();
  if (session) await audit(session, { action: 'auth.sign_out', entityType: 'User', entityId: session.userId });
  destroySession();
  return NextResponse.redirect(new URL('/login', env().APP_URL), { status: 303 });
}
