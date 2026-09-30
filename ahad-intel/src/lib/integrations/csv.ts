import type { Connector, NormalizedImport, NormalizedPerson } from './types';
import { finalizePerson, parseCsv, pick, splitName } from './normalize';

/**
 * Generic CSV / spreadsheet import. This is the baseline compliant path: the
 * operator supplies data they already hold and are entitled to use.
 */
export const csvConnector: Connector = {
  provider: 'CSV',
  label: 'CSV / spreadsheet import',
  capabilities: ['import'],
  credentialFields: [],
  compliance: {
    permitted: [
      'Import contact and company data the workspace already holds and is entitled to process.',
      'Record the lawful basis and the uploading user against every imported row.',
    ],
    prohibited: [
      'Importing lists obtained by scraping or in breach of another platform\'s terms.',
      'Importing data without a lawful basis for contacting the individuals.',
    ],
    credentialOwnership: 'none',
    attestation:
      'I confirm this file contains data my organisation is lawfully entitled to hold and use for business-to-business outreach, and that it was not obtained by scraping or in breach of any platform\'s terms of service.',
    defaultConsentBasis: 'LEGITIMATE_INTEREST',
  },

  async testConnection() {
    return { ok: true, message: 'CSV import needs no credentials.', checkedAt: new Date() };
  },

  async parseImport(content: string): Promise<NormalizedImport> {
    const rows = parseCsv(content);
    const people: NormalizedPerson[] = [];
    const errors: Array<{ row: number; message: string }> = [];
    let skipped = 0;

    rows.forEach((row, index) => {
      const fullName = pick(row, 'full_name', 'name', 'contact_name', 'person');
      const first = pick(row, 'first_name', 'firstname', 'given_name');
      const last = pick(row, 'last_name', 'lastname', 'surname', 'family_name');
      const company = pick(row, 'company', 'company_name', 'account', 'organization', 'organisation', 'employer');

      if (!company) { errors.push({ row: index + 2, message: 'Missing company name.' }); skipped += 1; return; }
      if (!fullName && !first) { errors.push({ row: index + 2, message: 'Missing contact name.' }); skipped += 1; return; }

      const names = first ? { firstName: first, lastName: last ?? '' } : splitName(fullName!);
      const employees = pick(row, 'employees', 'employee_count', 'headcount', 'company_size');

      people.push(
        finalizePerson({
          firstName: names.firstName,
          lastName: names.lastName,
          fullName: fullName ?? `${names.firstName} ${names.lastName}`.trim(),
          title: pick(row, 'title', 'job_title', 'position', 'role'),
          email: pick(row, 'email', 'work_email', 'email_address'),
          phone: pick(row, 'phone', 'mobile', 'phone_number', 'direct_dial'),
          linkedinUrl: pick(row, 'linkedin', 'linkedin_url', 'linkedin_profile', 'profile_url'),
          country: pick(row, 'country', 'contact_country'),
          city: pick(row, 'city', 'location'),
          externalId: pick(row, 'id', 'external_id'),
          company: {
            name: company,
            domain: pick(row, 'domain', 'company_domain', 'website'),
            website: pick(row, 'website', 'company_website'),
            linkedinUrl: pick(row, 'company_linkedin', 'company_linkedin_url'),
            description: pick(row, 'industry', 'company_description', 'description'),
            country: pick(row, 'company_country', 'country'),
            city: pick(row, 'company_city', 'city'),
            employeeCount: employees ? Number(employees.replace(/[^0-9]/g, '')) || null : null,
          },
        }),
      );
    });

    return { people, errors, detectedColumns: Object.keys(rows[0] ?? {}), skipped };
  },
};
