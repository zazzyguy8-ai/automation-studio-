/**
 * Maps free-text industry input onto machine categories.
 *
 * Type "autoservis", "car repair", "Autowerkstatt" or "bilverkstad" and you get
 * the same OSM tags. Without this, global search would only work for English
 * terms.
 */

export interface IndustryCategory {
  key: string;
  /** What we call it in the UI. */
  label: string;
  /** Terms in the languages of the priority markets. */
  aliases: string[];
  /** OSM tags as key=value. */
  osm: string[];
  /** Google Places (New) includedTypes. */
  places: string[];
  /** Templates that typically fit - a hint only; the audit decides. */
  likely_templates: string[];
}

export const INDUSTRIES: IndustryCategory[] = [
  {
    key: 'auto_repair', label: 'Auto repair / body shop',
    aliases: ['autoservis', 'car repair', 'auto repair', 'garage', 'body shop', 'mechanic',
      'autowerkstatt', 'kfz', 'werkstatt', 'bilverkstad', 'bilverksted', 'autokorjaamo', 'autoservice'],
    osm: ['shop=car_repair', 'shop=car', 'shop=tyres'],
    places: ['car_repair', 'car_dealer'],
    likely_templates: ['missed_call_sms', 'lead_response', 'quote_followup'],
  },
  {
    key: 'dental', label: 'Dental clinic',
    aliases: ['dental', 'dentist', 'zubar', 'zubár', 'zahnarzt', 'tandlakare', 'tandläkare',
      'tannlege', 'tandlaege', 'hammaslaakari', 'orthodontist'],
    osm: ['amenity=dentist', 'healthcare=dentist'],
    places: ['dentist'],
    likely_templates: ['ai_receptionist', 'review_request', 'internal_admin'],
  },
  {
    key: 'medical_clinic', label: 'Clinic / medical practice',
    aliases: ['clinic', 'klinika', 'medical', 'doctor', 'gp', 'praxis', 'arzt', 'physiotherapy',
      'fysioterapi', 'laakari', 'lääkäri', 'privatklinik', 'aesthetic clinic'],
    osm: ['amenity=clinic', 'amenity=doctors', 'healthcare=centre', 'healthcare=physiotherapist'],
    places: ['doctor', 'physiotherapist'],
    likely_templates: ['ai_receptionist', 'support_faq', 'internal_admin'],
  },
  {
    key: 'real_estate', label: 'Estate agency',
    aliases: ['real estate', 'realitka', 'realitni', 'estate agent', 'immobilien', 'makler',
      'fastighetsmaklare', 'fastighetsmäklare', 'eiendomsmegler', 'ejendomsmaegler', 'kiinteistonvalitys'],
    osm: ['office=estate_agent'],
    places: ['real_estate_agency'],
    likely_templates: ['lead_response', 'quote_followup', 'lead_followup'],
  },
  {
    key: 'construction', label: 'Construction / trades',
    aliases: ['construction', 'builder', 'stavebna', 'stavební', 'roofing', 'plumber', 'electrician',
      'bau', 'handwerker', 'dachdecker', 'installatör', 'rormokare', 'rørlegger', 'vvs', 'contractor'],
    osm: ['craft=builder', 'craft=roofer', 'craft=plumber', 'craft=electrician', 'craft=carpenter',
      'office=construction_company'],
    places: ['general_contractor', 'plumber', 'electrician', 'roofing_contractor'],
    likely_templates: ['missed_call_sms', 'quote_followup', 'lead_response'],
  },
  {
    key: 'law', label: 'Law firm',
    aliases: ['law', 'lawyer', 'solicitor', 'attorney', 'advokat', 'advokát', 'anwalt', 'kanzlei',
      'rechtsanwalt', 'jurist', 'asianajaja', 'legal'],
    osm: ['office=lawyer'],
    places: ['lawyer'],
    likely_templates: ['lead_response', 'internal_admin', 'support_faq'],
  },
  {
    key: 'accounting', label: 'Accounting / tax advisers',
    aliases: ['accounting', 'accountant', 'uctovnictvo', 'účtovníctvo', 'bookkeeping', 'steuerberater',
      'steuerberatung', 'buchhaltung', 'revisor', 'regnskap', 'tilitoimisto', 'tax advisor'],
    osm: ['office=accountant', 'office=tax_advisor'],
    places: ['accounting'],
    likely_templates: ['internal_admin', 'lead_response', 'support_faq'],
  },
  {
    key: 'salon', label: 'Salon / wellness',
    aliases: ['salon', 'hairdresser', 'kadernictvo', 'barber', 'friseur', 'spa', 'beauty',
      'frisor', 'frisör', 'kampaamo', 'kosmetik', 'nail'],
    osm: ['shop=hairdresser', 'shop=beauty', 'leisure=spa'],
    places: ['hair_salon', 'beauty_salon', 'spa'],
    likely_templates: ['ai_receptionist', 'review_request', 'lead_followup'],
  },
  {
    key: 'fitness', label: 'Gym / fitness studio',
    aliases: ['gym', 'fitness', 'posilnovna', 'pilates studio', 'yoga studio', 'pilates', 'yoga', 'crossfit',
      'fitnessstudio', 'treningssenter', 'kuntosali'],
    osm: ['leisure=fitness_centre', 'leisure=sports_centre'],
    places: ['gym', 'fitness_center'],
    likely_templates: ['lead_followup', 'ai_receptionist', 'review_request'],
  },
  {
    key: 'veterinary', label: 'Veterinary practice',
    aliases: ['vet', 'veterinary', 'veterina', 'tierarzt', 'veterinar', 'veterinär', 'dyrlege', 'elainlaakari'],
    osm: ['amenity=veterinary'],
    places: ['veterinary_care'],
    likely_templates: ['ai_receptionist', 'review_request', 'support_faq'],
  },
  {
    key: 'hospitality', label: 'Hotel / restaurant',
    aliases: ['hotel', 'restaurant', 'restauracia', 'reštaurácia', 'cafe', 'gasthaus', 'pension',
      'hotell', 'ravintola', 'bistro'],
    osm: ['tourism=hotel', 'tourism=guest_house', 'amenity=restaurant'],
    places: ['hotel', 'restaurant'],
    likely_templates: ['ai_receptionist', 'review_request', 'support_faq'],
  },
  {
    key: 'it_agency', label: 'IT / marketing agency',
    aliases: ['agency', 'agentura', 'agentúra', 'marketing', 'software', 'it company', 'webdesign',
      'werbeagentur', 'byra', 'byrå', 'digital agency', 'consultancy'],
    osm: ['office=it', 'office=advertising_agency', 'office=company'],
    places: ['marketing_agency'],
    likely_templates: ['lead_response', 'quote_followup', 'internal_admin'],
  },
];

/** Strips diacritics and punctuation so "zubar", "zubár" and "Zahnarzt"
 *  all take the same path. */
const normalize = (s: string) => s
  .toLowerCase()
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/**
 * Resolves a category from free text in any supported language.
 *
 * Matching is on word boundaries, not substrings. A loose `includes` looked
 * convenient but mapped "interpretive dance studio" onto fitness - and a silent
 * category error means an entire list of irrelevant companies.
 */
export function resolveIndustry(input: string): IndustryCategory | null {
  const q = normalize(input);
  if (!q) return null;
  const words = q.split(' ');

  const matches = (alias: string): boolean => {
    const a = normalize(alias);
    if (!a) return false;
    if (q === a) return true;
    // A multi-word alias must match as a contiguous run of words.
    if (a.includes(' ')) return ` ${q} `.includes(` ${a} `);
    // A single-word alias must be a whole word of the query.
    if (words.includes(a)) return true;
    // German and Nordic languages glue words together: Immobilienmakler,
    // Zahnarztpraxis, Steuerberatungskanzlei. Without this the DACH and Nordic
    // priority markets would only work on exact forms. The length threshold
    // keeps short common words from matching anything and everything.
    const COMPOUND_MIN = 5;
    if (a.length >= COMPOUND_MIN) return words.some((w) => w.includes(a));
    return false;
  };

  // A compound can match several categories at once ("Steuerberatungskanzlei"
  // also contains 'kanzlei'). The longest match wins, i.e. the most specific
  // term - the order of categories in the array decides nothing.
  let best: { cat: IndustryCategory; score: number } | null = null;

  for (const cat of INDUSTRIES) {
    if (cat.key === q.replace(/ /g, '_')) return cat;
    for (const alias of cat.aliases) {
      if (!matches(alias)) continue;
      const score = normalize(alias).length;
      if (!best || score > best.score) best = { cat, score };
    }
  }
  return best?.cat ?? null;
}

/** List for the UI and error messages. */
export function industryOptions(): Array<{ key: string; label: string }> {
  return INDUSTRIES.map((i) => ({ key: i.key, label: i.label }));
}
