import type { IntegrationProvider } from '@prisma/client';
import { apolloConnector } from './apollo';
import { csvConnector } from './csv';
import { linkedinApiConnector, linkedinExportConnector } from './linkedin';
import { lushaConnector } from './lusha';
import type { Connector } from './types';

/**
 * The connector registry. Adding a provider is one module plus one line here —
 * normalization, dedupe, provenance, scoring and the UI are all shared.
 */
export const CONNECTORS: Partial<Record<IntegrationProvider, Connector>> = {
  CSV: csvConnector,
  LINKEDIN_EXPORT: linkedinExportConnector,
  LINKEDIN_API: linkedinApiConnector,
  LUSHA: lushaConnector,
  APOLLO: apolloConnector,
};

export function connectorFor(provider: IntegrationProvider): Connector | null {
  return CONNECTORS[provider] ?? null;
}

export function availableConnectors(): Connector[] {
  return Object.values(CONNECTORS).filter((c): c is Connector => Boolean(c));
}

export * from './types';
export * from './normalize';
