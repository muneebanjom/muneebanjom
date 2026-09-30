import './server-guard';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';
import { prisma } from './db';
import { env } from './env';
import { assertPermission, can, type Permission } from './rbac';

const COOKIE = 'ahad_session';
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12h — short-lived, re-auth daily

export interface SessionUser {
  userId: string;
  email: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  role: Role;
}

function secret() {
  return new TextEncoder().encode(env().AUTH_SECRET);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .setSubject(user.userId)
    .sign(secret());

  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env().NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export function destroySession(): void {
  cookies().delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.workspaceId || !payload.userId) return null;
    return {
      userId: String(payload.userId),
      email: String(payload.email),
      name: String(payload.name),
      workspaceId: String(payload.workspaceId),
      workspaceName: String(payload.workspaceName),
      workspaceSlug: String(payload.workspaceSlug),
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

/** Use in every authenticated page and server action. */
export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const session = await requireSession();
  assertPermission(session.role, permission);
  return session;
}

export async function sessionCan(permission: Permission): Promise<boolean> {
  const session = await getSession();
  return session ? can(session.role, permission) : false;
}

export interface SignInResult {
  ok: boolean;
  error?: string;
  session?: SessionUser;
}

export async function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalized },
    include: { memberships: { include: { workspace: true }, orderBy: { createdAt: 'asc' } } },
  });

  // Constant-ish work regardless of user existence, to avoid user enumeration.
  const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
  const valid = await verifyPassword(password, hash);

  if (!user || !valid || !user.isActive) return { ok: false, error: 'Invalid email or password.' };
  const membership = user.memberships[0];
  if (!membership) return { ok: false, error: 'This account is not a member of any workspace.' };

  const session: SessionUser = {
    userId: user.id,
    email: user.email,
    name: user.name,
    workspaceId: membership.workspaceId,
    workspaceName: membership.workspace.name,
    workspaceSlug: membership.workspace.slug,
    role: membership.role,
  };
  await createSession(session);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { ok: true, session };
}

export function requestContext(): { ip?: string; userAgent?: string } {
  try {
    const h = headers();
    return {
      ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
      userAgent: h.get('user-agent') ?? undefined,
    };
  } catch {
    return {};
  }
}
