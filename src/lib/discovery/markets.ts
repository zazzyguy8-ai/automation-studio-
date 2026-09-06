/**
 * Trhové profily pre prioritné regióny.
 *
 * `outreach_risk` NIE JE právne poradenstvo. Je to prevádzkový signál: režim
 * cold emailu sa medzi týmito trhmi líši natoľko, že jedna šablóna pre všetky
 * je zlý nápad. Vysoké riziko neznamená zákaz - znamená, že pred schválením
 * musíš vedome potvrdiť, že vieš, do čoho ideš, a ideálne si to overiť s
 * právnikom pre svoj konkrétny prípad.
 */

export type OutreachRisk = 'low' | 'medium' | 'high';

export interface Market {
  country: string;
  name: string;
  /** Jazyk, v ktorom má byť outreach napísaný. */
  outreach_language: string;
  currency: string;
  /** Priorita podľa zadania: 1 = hlavné trhy. */
  priority: 1 | 2 | 3;
  outreach_risk: OutreachRisk;
  /** Krátke zhrnutie režimu, ktoré sa zobrazí pred schválením. */
  outreach_note: string;
  /** Čo musí správa obsahovať, aby vôbec smela ísť von. */
  required_in_message: string[];
  /** Preferovaný SMS/voice provider pre dodávaného agenta. */
  telco: 'telnyx' | 'twilio';
}

const NORDIC_NOTE =
  'B2B cold email na firemné adresy je bežne akceptovaný pod ePrivacy/GDPR, ak ide o oprávnený '
  + 'záujem, správa je relevantná pre pracovnú rolu príjemcu a odhlásenie funguje okamžite. '
  + 'Osobné adresy typu meno@ maj za rizikovejšie ako info@ / office@.';

export const MARKETS: Market[] = [
  {
    country: 'GB', name: 'United Kingdom', outreach_language: 'English', currency: 'GBP',
    priority: 1, outreach_risk: 'low',
    outreach_note:
      'PECR: B2B cold email na registrované firmy (Ltd, PLC) je povolený s funkčným opt-outom. '
      + 'Živnostníci a partnerstvá sa posudzujú ako fyzické osoby a potrebujú prísnejší základ - '
      + 'preto radšej mier na registrované firmy.',
    required_in_message: ['funkčné odhlásenie', 'identita odosielateľa', 'dôvod kontaktovania'],
    telco: 'twilio',
  },
  {
    country: 'US', name: 'United States', outreach_language: 'English', currency: 'USD',
    priority: 1, outreach_risk: 'low',
    outreach_note:
      'CAN-SPAM: cold email je povolený. Povinné je pravdivé predmet a hlavička, fyzická poštová '
      + 'adresa odosielateľa a odhlásenie spracované do 10 pracovných dní. Niektoré štáty '
      + '(napr. CA) majú prísnejšie pravidlá.',
    required_in_message: ['fyzická poštová adresa', 'funkčné odhlásenie', 'pravdivý predmet'],
    telco: 'twilio',
  },
  {
    country: 'DE', name: 'Germany', outreach_language: 'German', currency: 'EUR',
    priority: 1, outreach_risk: 'high',
    outreach_note:
      'UWG §7: cold email BEZ predchádzajúceho súhlasu je v Nemecku považovaný za neprípustné '
      + 'obťažovanie - a to aj v B2B. Hrozia Abmahnung a náklady protistrany. Reálne bezpečnejšie '
      + 'cesty: LinkedIn, telefonát na zverejnené firemné číslo, alebo kontaktný formulár firmy. '
      + 'Ak posielaš email, rob to s vedomím rizika a s právnym stanoviskom.',
    required_in_message: ['Impressum odosielateľa', 'funkčné odhlásenie', 'jasný dôvod kontaktu'],
    telco: 'telnyx',
  },
  {
    country: 'AT', name: 'Austria', outreach_language: 'German', currency: 'EUR',
    priority: 1, outreach_risk: 'high',
    outreach_note:
      'TKG §174: nevyžiadaná elektronická pošta na komerčné účely vyžaduje predchádzajúci súhlas. '
      + 'Rovnaký prístup ako v Nemecku - preferuj telefón, formulár alebo LinkedIn.',
    required_in_message: ['identita odosielateľa', 'funkčné odhlásenie'],
    telco: 'telnyx',
  },
  {
    country: 'CH', name: 'Switzerland', outreach_language: 'German', currency: 'CHF',
    priority: 1, outreach_risk: 'medium',
    outreach_note:
      'UWG Art. 3: hromadná reklama bez súhlasu je problematická, no B2B kontakt s jasným '
      + 'odhlásením je v praxi bežnejší než v DE/AT. Rešpektuj hviezdičku pri zápise v telefónnom '
      + 'zozname (znamená zákaz reklamy).',
    required_in_message: ['identita odosielateľa', 'funkčné odhlásenie'],
    telco: 'telnyx',
  },
  {
    country: 'SE', name: 'Sweden', outreach_language: 'English', currency: 'SEK',
    priority: 1, outreach_risk: 'medium', outreach_note: NORDIC_NOTE,
    required_in_message: ['identita odosielateľa', 'funkčné odhlásenie'], telco: 'telnyx',
  },
  {
    country: 'NO', name: 'Norway', outreach_language: 'English', currency: 'NOK',
    priority: 1, outreach_risk: 'medium', outreach_note: NORDIC_NOTE,
    required_in_message: ['identita odosielateľa', 'funkčné odhlásenie'], telco: 'telnyx',
  },
  {
    country: 'DK', name: 'Denmark', outreach_language: 'English', currency: 'DKK',
    priority: 1, outreach_risk: 'high',
    outreach_note:
      'Markedsføringsloven §10: dánsky režim je prísny a vzťahuje sa aj na B2B - elektronický '
      + 'marketing bez súhlasu je zakázaný a pokutovaný. Preferuj telefón alebo LinkedIn.',
    required_in_message: ['identita odosielateľa', 'funkčné odhlásenie'], telco: 'telnyx',
  },
  {
    country: 'FI', name: 'Finland', outreach_language: 'English', currency: 'EUR',
    priority: 1, outreach_risk: 'medium', outreach_note: NORDIC_NOTE,
    required_in_message: ['identita odosielateľa', 'funkčné odhlásenie'], telco: 'telnyx',
  },
  {
    country: 'IE', name: 'Ireland', outreach_language: 'English', currency: 'EUR',
    priority: 2, outreach_risk: 'low',
    outreach_note: 'B2B cold email na firemné adresy je povolený s funkčným odhlásením (SI 336/2011).',
    required_in_message: ['identita odosielateľa', 'funkčné odhlásenie'], telco: 'twilio',
  },
  {
    country: 'NL', name: 'Netherlands', outreach_language: 'English', currency: 'EUR',
    priority: 2, outreach_risk: 'medium',
    outreach_note: 'Telecommunicatiewet: B2B je povolený, ale s jasným odhlásením a identifikáciou.',
    required_in_message: ['identita odosielateľa', 'funkčné odhlásenie'], telco: 'telnyx',
  },
  {
    country: 'SK', name: 'Slovakia', outreach_language: 'Slovak', currency: 'EUR',
    priority: 3, outreach_risk: 'medium',
    outreach_note: 'Zákon 351/2011 §62: B2B na firemné adresy s odhlásením; osobné adresy vyžadujú súhlas.',
    required_in_message: ['identita odosielateľa', 'funkčné odhlásenie'], telco: 'telnyx',
  },
  {
    country: 'CZ', name: 'Czechia', outreach_language: 'Czech', currency: 'CZK',
    priority: 3, outreach_risk: 'medium',
    outreach_note: 'Zákon 480/2004: B2B na firemné adresy s odhlásením je v praxi akceptovaný.',
    required_in_message: ['identita odosielateľa', 'funkčné odhlásenie'], telco: 'telnyx',
  },
];

/** Fallback pre trh, ktorý ešte nemáme zmapovaný. Zámerne konzervatívny. */
export const UNKNOWN_MARKET: Market = {
  country: '??', name: 'Neznámy trh', outreach_language: 'English', currency: 'EUR',
  priority: 3, outreach_risk: 'high',
  outreach_note:
    'Pre túto krajinu nemáme zmapovaný režim cold outreachu. Kým si ho neoveríš, ber ho ako '
    + 'rizikový a preferuj kanály, kde ťa firma oslovuje sama (formulár, telefón, LinkedIn).',
  required_in_message: ['identita odosielateľa', 'funkčné odhlásenie'],
  telco: 'telnyx',
};

export function getMarket(country: string | null | undefined): Market {
  if (!country) return UNKNOWN_MARKET;
  const code = country.trim().toUpperCase();
  return MARKETS.find((m) => m.country === code) ?? { ...UNKNOWN_MARKET, country: code };
}

/** Prioritné trhy podľa zadania, na zoradenie ponuky v UI. */
export const PRIORITY_MARKETS = MARKETS.filter((m) => m.priority === 1);
