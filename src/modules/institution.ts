import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/http.js';
import { DEFAULT_INSTITUTION } from './institution-defaults.js';

/**
 * The institution this deployment serves.
 *
 * Resolion Campus OS is sold to universities, colleges, schools and
 * institutes alike, so nothing about the customer lives in code. Clients
 * read it here — before sign-in, since the login page shows it — and an
 * administrator edits it from the IT console.
 */
export const institutionRouter = Router();

export const institutionInput = z.object({
  name: z.string().trim().min(2).max(160),
  nameHi: z.string().trim().max(160).nullish(),
  shortCode: z
    .string()
    .trim()
    .min(1)
    .max(6)
    .transform((s) => s.toUpperCase()),
  kind: z.enum(['University', 'College', 'School', 'Institute', 'Academy', 'Other']),
  tagline: z.string().trim().max(160).nullish(),
  address: z.string().trim().max(300).nullish(),
  city: z.string().trim().max(80).nullish(),
  state: z.string().trim().max(80).nullish(),
  pincode: z.string().trim().max(12).nullish(),
  country: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(40).nullish(),
  email: z.string().trim().email().max(160).nullish().or(z.literal('')),
  website: z.string().trim().max(200).nullish(),
  emailDomain: z.string().trim().max(120).nullish(),
  helpdesk: z.string().trim().max(160).nullish(),
});

export { DEFAULT_INSTITUTION };

export async function getInstitution() {
  const row = await prisma.institution.findUnique({ where: { id: 'default' } });
  return row ?? DEFAULT_INSTITUTION;
}

// ─── GET /api/institution ─────────────────────────────────────────────────────

institutionRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    // Public and rarely changed; a short cache spares the sign-in page a trip.
    res.set('Cache-Control', 'public, max-age=60');
    res.json(await getInstitution());
  }),
);

/**
 * The institution's short code, for the prefixes of the numbers it issues
 * (enrolment, receipts, tenders, purchase orders), so a customer's documents
 * carry their own initials rather than the demo's.
 */
export async function institutionCode(): Promise<string> {
  return (await getInstitution()).shortCode;
}
