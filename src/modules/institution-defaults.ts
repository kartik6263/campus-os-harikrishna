/**
 * What a fresh install shows until an administrator fills in
 * IT Console → Institution. Kept free of imports so the seed can use it.
 */
export const DEFAULT_INSTITUTION = {
  id: 'default',
  name: 'Resolion Demo University',
  nameHi: 'रिज़ोलियन डेमो विश्वविद्यालय',
  shortCode: 'RDU',
  kind: 'University',
  tagline: 'Powered by Resolion Campus OS',
  address: '1 Campus Road',
  city: 'Demo City',
  state: null as string | null,
  pincode: null as string | null,
  country: 'India',
  phone: null as string | null,
  email: null as string | null,
  website: null as string | null,
  emailDomain: 'demo.resolion.edu',
  helpdesk: null as string | null,
};
