import type { Channel, MessageKind } from '@prisma/client';

/**
 * Template rendering with `{{placeholder}}` variables.
 * Unknown placeholders are replaced with a safe fallback rather than leaking
 * `{{...}}` into a message a human is about to send.
 */
export interface TemplateVars {
  first_name: string;
  full_name: string;
  title: string;
  company: string;
  country: string;
  region: string;
  vertical: string;
  persona: string;
  trigger: string;
  angle: string;
  regulator: string;
  pain_point: string;
  sender_name: string;
  sender_company: string;
  cta: string;
}

const FALLBACKS: Partial<Record<keyof TemplateVars, string>> = {
  trigger: 'your current priorities',
  regulator: 'your regulator',
  pain_point: 'the risks you are carrying',
  title: 'your role',
};

export function renderTemplate(body: string, vars: Partial<TemplateVars>): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, rawKey: string) => {
    const key = rawKey.toLowerCase() as keyof TemplateVars;
    const value = vars[key];
    if (value && value.trim()) return value.trim();
    return FALLBACKS[key] ?? '';
  }).replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function extractPlaceholders(body: string): string[] {
  return [...new Set([...body.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map((m) => m[1].toLowerCase()))];
}

/** Channel limits enforced in the editor so a human never pastes an invalid message. */
export const CHANNEL_LIMITS: Partial<Record<Channel, number>> = {
  LINKEDIN_CONNECTION: 300, // LinkedIn connection note limit
  LINKEDIN_MESSAGE: 1900,
  EMAIL: 5000,
};

export function limitFor(channel: Channel, kind: MessageKind): number {
  if (kind === 'LINKEDIN_CONNECTION_REQUEST') return 300;
  return CHANNEL_LIMITS[channel] ?? 5000;
}

export function withinLimit(body: string, channel: Channel, kind: MessageKind): boolean {
  return body.length <= limitFor(channel, kind);
}
