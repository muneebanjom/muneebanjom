import { env } from '../env';
import type { Connector, ConnectorCredentials, ConnectorHealth, NormalizedImport, NormalizedPerson } from './types';
import { finalizePerson, parseCsv, pick, splitName } from './normalize';

/**
 * LinkedIn support — compliant paths only.
 *
 * What this module does:
 *  - parses a data export the *user themselves* downloaded from LinkedIn, or a
 *    CSV export their licence permits, and
 *  - stores a profile URL as a human reference for manual, browser-assisted research.
 *
 * What this module deliberately does NOT do, and must never be extended to do:
 *  - fetch or parse any linkedin.com page,
 *  - replay cookies or session tokens,
 *  - automate connection requests, messages or InMail,
 *  - evade rate limits, login walls, CAPTCHAs or robots directives.
 *
 * Outbound LinkedIn steps always end with a human sending an approved draft
 * themselves; the platform only records that it happened.
 */
export const linkedinExportConnector: Connector = {
  provider: 'LINKEDIN_EXPORT',
  label: 'LinkedIn data export (user-provided)',
  capabilities: ['import'],
  credentialFields: [],
  compliance: {
    permitted: [
      'Import a data archive the user downloaded from their own LinkedIn account.',
      'Import CSV exports the user\'s own licence permits them to take.',
      'Store a public profile URL as a reference for manual research a human performs in their own browser.',
    ],
    prohibited: [
      'Scraping or fetching any linkedin.com page.',
      'Using cookies, session tokens or headless browsers against LinkedIn.',
      'Automating connection requests, messages or InMail.',
      'Bypassing rate limits, login walls or access controls.',
    ],
    credentialOwnership: 'user',
    attestation:
      'I confirm this data was exported from LinkedIn by me, from my own account, using LinkedIn\'s own export or an export my licence permits, and that no scraping or automation was used to obtain it.',
    defaultConsentBasis: 'USER_PROVIDED',
    docsUrl: 'https://www.linkedin.com/help/linkedin/answer/a1339364',
  },

  async testConnection(): Promise<ConnectorHealth> {
    return { ok: true, message: 'User-provided export — no credentials and no API calls.', checkedAt: new Date() };
  },

  async parseImport(content: string): Promise<NormalizedImport> {
    const rows = parseCsv(content);
    const people: NormalizedPerson[] = [];
    const errors: Array<{ row: number; message: string }> = [];
    let skipped = 0;

    rows.forEach((row, index) => {
      // LinkedIn's Connections.csv: First Name, Last Name, URL, Email Address, Company, Position, Connected On
      const first = pick(row, 'first_name', 'firstname');
      const last = pick(row, 'last_name', 'lastname');
      const fullName = pick(row, 'full_name', 'name');
      const company = pick(row, 'company', 'company_name', 'current_company');

      if (!first && !fullName) { errors.push({ row: index + 2, message: 'Missing contact name.' }); skipped += 1; return; }
      if (!company) { errors.push({ row: index + 2, message: 'No company on this connection — import it manually if it matters.' }); skipped += 1; return; }

      const names = first ? { firstName: first, lastName: last ?? '' } : splitName(fullName!);
      people.push(
        finalizePerson({
          firstName: names.firstName,
          lastName: names.lastName,
          fullName: fullName ?? `${names.firstName} ${names.lastName}`.trim(),
          title: pick(row, 'position', 'title', 'job_title'),
          email: pick(row, 'email_address', 'email'),
          linkedinUrl: pick(row, 'url', 'profile_url', 'linkedin_url'),
          country: pick(row, 'country', 'location'),
          company: {
            name: company,
            description: pick(row, 'industry'),
            country: pick(row, 'country', 'location'),
          },
        }),
      );
    });

    return { people, errors, detectedColumns: Object.keys(rows[0] ?? {}), skipped };
  },
};

/**
 * Approved-partner LinkedIn API scaffold. Intentionally inert until the
 * workspace supplies its own approved client credentials AND an admin attests
 * partner status — there is no code path that reaches LinkedIn without both.
 */
export const linkedinApiConnector: Connector = {
  provider: 'LINKEDIN_API',
  label: 'LinkedIn (approved API)',
  capabilities: ['enrich_company'],
  credentialFields: [
    { key: 'accessToken', label: 'OAuth access token', type: 'password', help: 'Issued to your own approved LinkedIn application.' },
    { key: 'accountRef', label: 'Organization URN', type: 'text', help: 'e.g. urn:li:organization:12345' },
  ],
  compliance: {
    permitted: [
      'Call only LinkedIn API endpoints your application has been approved for.',
      'Use your own application credentials and honour LinkedIn\'s rate limits.',
    ],
    prohibited: [
      'Accessing member data outside your approved scopes.',
      'Any scraping, session replay or messaging automation.',
    ],
    credentialOwnership: 'workspace',
    attestation:
      'I confirm my organisation operates a LinkedIn application approved for the endpoints we will call, and that our use complies with the LinkedIn API Terms of Use.',
    defaultConsentBasis: 'CONTRACT',
    docsUrl: 'https://learn.microsoft.com/en-us/linkedin/',
  },

  async testConnection(creds: ConnectorCredentials): Promise<ConnectorHealth> {
    if (!env().LINKEDIN_CLIENT_ID) {
      return { ok: false, message: 'LinkedIn API is not configured on this deployment (LINKEDIN_CLIENT_ID unset).', checkedAt: new Date() };
    }
    if (!creds.accessToken) {
      return { ok: false, message: 'No access token supplied.', checkedAt: new Date() };
    }
    return {
      ok: false,
      message: 'Connect your approved LinkedIn application to enable this connector. No endpoint is called until approval is attested.',
      checkedAt: new Date(),
    };
  },
};
