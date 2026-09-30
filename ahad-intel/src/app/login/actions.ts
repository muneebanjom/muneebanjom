'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { signInWithPassword } from '@/lib/auth';
import { audit } from '@/lib/audit';

const schema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the details you entered.' };
  }

  const result = await signInWithPassword(parsed.data.email, parsed.data.password);
  if (!result.ok || !result.session) {
    return { error: result.error ?? 'Sign in failed.' };
  }

  await audit(result.session, { action: 'auth.sign_in', entityType: 'User', entityId: result.session.userId });
  redirect('/');
}
