/**
 * Market profiles for the priority regions.
 *
 * `outreach_risk` is NOT legal advice. It is an operational signal: cold email
 * regimes differ enough across these markets that one template for all of them
 * is a bad idea. High risk does not mean forbidden - it means approval requires
 * a deliberate decision, and ideally a lawyer's view on your specific case.
 */

export type OutreachRisk = 'low' | 'medium' | 'high';

export interface Market {
  country: string;
  name: string;
  /** Language the outreach should be written in. */
  outreach_language: string;
  currency: string;
  /** Priority per the brief: 1 = the markets we actually target. */
  priority: 1 | 2 | 3;
  outreach_risk: OutreachRisk;
  /** Short summary of the regime, shown before approval. */
  outreach_note: string;
  /** What the message must contain before it may go out. */
  required_in_message: string[];
  /** Preferred SMS/voice provider for the delivered agent. */
  telco: 'telnyx' | 'twilio';
}

const NORDIC_NOTE =
  'B2B cold email to corporate addresses is generally accepted under ePrivacy/GDPR where there is '
  + 'a legitimate interest, the message is relevant to the recipient\'s professional role, and opt-out '
  + 'is immediate. Treat named personal addresses as riskier than info@ / office@.';

export const MARKETS: Market[] = [
  {
    country: 'GB', name: 'United Kingdom', outreach_language: 'English', currency: 'GBP',
    priority: 1, outreach_risk: 'low',
    outreach_note:
      'PECR: B2B cold email to registered companies (Ltd, PLC) is permitted with a working opt-out. '
      + 'Sole traders and partnerships are treated as individuals and need a stricter basis, so aim at '
      + 'registered companies.',
    required_in_message: ['a working opt-out', 'sender identity', 'why you are getting in touch'],
    telco: 'twilio',
  },
  {
    country: 'US', name: 'United States', outreach_language: 'English', currency: 'USD',
    priority: 1, outreach_risk: 'low',
    outreach_note:
      'CAN-SPAM: cold email is permitted. Required are truthful headers and subject, a physical postal '
      + 'address for the sender, and opt-out honoured within 10 business days. Some states (e.g. CA) '
      + 'go further.',
    required_in_message: ['a physical postal address', 'a working opt-out', 'a truthful subject line'],
    telco: 'twilio',
  },
  {
    country: 'DE', name: 'Germany', outreach_language: 'German', currency: 'EUR',
    priority: 1, outreach_risk: 'high',
    outreach_note:
      'UWG section 7: cold email WITHOUT prior consent counts as unreasonable nuisance in Germany, B2B '
      + 'included. Abmahnung and the other side\'s costs are the realistic downside. Safer routes: '
      + 'LinkedIn, a call to the published company number, or the company\'s own contact form. If you '
      + 'do email, do it knowing the risk and with legal advice.',
    required_in_message: ['sender Impressum', 'a working opt-out', 'a clear reason for contact'],
    telco: 'telnyx',
  },
  {
    country: 'AT', name: 'Austria', outreach_language: 'German', currency: 'EUR',
    priority: 1, outreach_risk: 'high',
    outreach_note:
      'TKG section 174: unsolicited electronic mail for commercial purposes requires prior consent. '
      + 'Same posture as Germany - prefer the phone, the contact form, or LinkedIn.',
    required_in_message: ['sender identity', 'a working opt-out'],
    telco: 'telnyx',
  },
  {
    country: 'CH', name: 'Switzerland', outreach_language: 'German', currency: 'CHF',
    priority: 1, outreach_risk: 'medium',
    outreach_note:
      'UWG Art. 3: mass advertising without consent is problematic, but B2B contact with a clear opt-out '
      + 'is more common in practice than in DE/AT. Respect the asterisk in directory listings - it means '
      + 'advertising is refused.',
    required_in_message: ['sender identity', 'a working opt-out'],
    telco: 'telnyx',
  },
  {
    country: 'SE', name: 'Sweden', outreach_language: 'English', currency: 'SEK',
    priority: 1, outreach_risk: 'medium', outreach_note: NORDIC_NOTE,
    required_in_message: ['sender identity', 'a working opt-out'], telco: 'telnyx',
  },
  {
    country: 'NO', name: 'Norway', outreach_language: 'English', currency: 'NOK',
    priority: 1, outreach_risk: 'medium', outreach_note: NORDIC_NOTE,
    required_in_message: ['sender identity', 'a working opt-out'], telco: 'telnyx',
  },
  {
    country: 'DK', name: 'Denmark', outreach_language: 'English', currency: 'DKK',
    priority: 1, outreach_risk: 'high',
    outreach_note:
      'Markedsforingsloven section 10: the Danish regime is strict and covers B2B - electronic marketing '
      + 'without consent is prohibited and fined. Prefer the phone or LinkedIn.',
    required_in_message: ['sender identity', 'a working opt-out'], telco: 'telnyx',
  },
  {
    country: 'FI', name: 'Finland', outreach_language: 'English', currency: 'EUR',
    priority: 1, outreach_risk: 'medium', outreach_note: NORDIC_NOTE,
    required_in_message: ['sender identity', 'a working opt-out'], telco: 'telnyx',
  },
  {
    country: 'IE', name: 'Ireland', outreach_language: 'English', currency: 'EUR',
    priority: 2, outreach_risk: 'low',
    outreach_note: 'B2B cold email to corporate addresses is permitted with a working opt-out (SI 336/2011).',
    required_in_message: ['sender identity', 'a working opt-out'], telco: 'twilio',
  },
  {
    country: 'NL', name: 'Netherlands', outreach_language: 'English', currency: 'EUR',
    priority: 2, outreach_risk: 'medium',
    outreach_note: 'Telecommunicatiewet: B2B is permitted, but with a clear opt-out and identification.',
    required_in_message: ['sender identity', 'a working opt-out'], telco: 'telnyx',
  },
  {
    country: 'SK', name: 'Slovakia', outreach_language: 'Slovak', currency: 'EUR',
    priority: 3, outreach_risk: 'medium',
    outreach_note: 'Act 351/2011 section 62: B2B to corporate addresses with opt-out; personal addresses need consent.',
    required_in_message: ['sender identity', 'a working opt-out'], telco: 'telnyx',
  },
  {
    country: 'CZ', name: 'Czechia', outreach_language: 'Czech', currency: 'CZK',
    priority: 3, outreach_risk: 'medium',
    outreach_note: 'Act 480/2004: B2B to corporate addresses with an opt-out is accepted in practice.',
    required_in_message: ['sender identity', 'a working opt-out'], telco: 'telnyx',
  },
];

/** Fallback for a market we have not mapped. Deliberately conservative. */
export const UNKNOWN_MARKET: Market = {
  country: '??', name: 'Unmapped market', outreach_language: 'English', currency: 'EUR',
  priority: 3, outreach_risk: 'high',
  outreach_note:
    'We have not mapped the cold outreach regime for this country. Until you have checked it, treat it '
    + 'as risky and prefer channels where the business invites contact (their form, their phone, LinkedIn).',
  required_in_message: ['sender identity', 'a working opt-out'],
  telco: 'telnyx',
};

export function getMarket(country: string | null | undefined): Market {
  if (!country) return UNKNOWN_MARKET;
  const code = country.trim().toUpperCase();
  return MARKETS.find((m) => m.country === code) ?? { ...UNKNOWN_MARKET, country: code };
}

/** The markets the brief prioritises, for ordering the UI. */
export const PRIORITY_MARKETS = MARKETS.filter((m) => m.priority === 1);
