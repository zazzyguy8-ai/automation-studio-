/**
 * Mapovanie voľného textu odvetvia na strojové kategórie.
 *
 * Zadáš "autoservis", "car repair", "Autowerkstatt" alebo "bilverkstad" a
 * dostaneš tie isté OSM tagy. Bez tohto by globálne hľadanie fungovalo len
 * pre anglické výrazy.
 */

export interface IndustryCategory {
  key: string;
  /** Ako to voláme v UI. */
  label: string;
  /** Výrazy vo viacerých jazykoch prioritných trhov. */
  aliases: string[];
  /** OSM tagy vo formáte kľúč=hodnota. */
  osm: string[];
  /** Google Places (New) includedTypes. */
  places: string[];
  /** Ktoré agent templates sem typicky sadnú - len návrh, audit rozhoduje. */
  likely_templates: string[];
}

export const INDUSTRIES: IndustryCategory[] = [
  {
    key: 'auto_repair', label: 'Autoservis / karoséria',
    aliases: ['autoservis', 'car repair', 'auto repair', 'garage', 'body shop', 'mechanic',
      'autowerkstatt', 'kfz', 'werkstatt', 'bilverkstad', 'bilverksted', 'autokorjaamo', 'autoservice'],
    osm: ['shop=car_repair', 'shop=car', 'shop=tyres'],
    places: ['car_repair', 'car_dealer'],
    likely_templates: ['missed_call_sms', 'lead_response', 'quote_followup'],
  },
  {
    key: 'dental', label: 'Zubná klinika',
    aliases: ['dental', 'dentist', 'zubar', 'zubár', 'zahnarzt', 'tandlakare', 'tandläkare',
      'tannlege', 'tandlaege', 'hammaslaakari', 'orthodontist'],
    osm: ['amenity=dentist', 'healthcare=dentist'],
    places: ['dentist'],
    likely_templates: ['ai_receptionist', 'review_request', 'internal_admin'],
  },
  {
    key: 'medical_clinic', label: 'Klinika / ambulancia',
    aliases: ['clinic', 'klinika', 'medical', 'doctor', 'gp', 'praxis', 'arzt', 'physiotherapy',
      'fysioterapi', 'laakari', 'lääkäri', 'privatklinik', 'aesthetic clinic'],
    osm: ['amenity=clinic', 'amenity=doctors', 'healthcare=centre', 'healthcare=physiotherapist'],
    places: ['doctor', 'physiotherapist'],
    likely_templates: ['ai_receptionist', 'support_faq', 'internal_admin'],
  },
  {
    key: 'real_estate', label: 'Realitná kancelária',
    aliases: ['real estate', 'realitka', 'realitni', 'estate agent', 'immobilien', 'makler',
      'fastighetsmaklare', 'fastighetsmäklare', 'eiendomsmegler', 'ejendomsmaegler', 'kiinteistonvalitys'],
    osm: ['office=estate_agent'],
    places: ['real_estate_agency'],
    likely_templates: ['lead_response', 'quote_followup', 'lead_followup'],
  },
  {
    key: 'construction', label: 'Stavebná firma / remeslá',
    aliases: ['construction', 'builder', 'stavebna', 'stavební', 'roofing', 'plumber', 'electrician',
      'bau', 'handwerker', 'dachdecker', 'installatör', 'rormokare', 'rørlegger', 'vvs', 'contractor'],
    osm: ['craft=builder', 'craft=roofer', 'craft=plumber', 'craft=electrician', 'craft=carpenter',
      'office=construction_company'],
    places: ['general_contractor', 'plumber', 'electrician', 'roofing_contractor'],
    likely_templates: ['missed_call_sms', 'quote_followup', 'lead_response'],
  },
  {
    key: 'law', label: 'Advokátska kancelária',
    aliases: ['law', 'lawyer', 'solicitor', 'attorney', 'advokat', 'advokát', 'anwalt', 'kanzlei',
      'rechtsanwalt', 'jurist', 'asianajaja', 'legal'],
    osm: ['office=lawyer'],
    places: ['lawyer'],
    likely_templates: ['lead_response', 'internal_admin', 'support_faq'],
  },
  {
    key: 'accounting', label: 'Účtovníctvo / daňoví poradcovia',
    aliases: ['accounting', 'accountant', 'uctovnictvo', 'účtovníctvo', 'bookkeeping', 'steuerberater',
      'steuerberatung', 'buchhaltung', 'revisor', 'regnskap', 'tilitoimisto', 'tax advisor'],
    osm: ['office=accountant', 'office=tax_advisor'],
    places: ['accounting'],
    likely_templates: ['internal_admin', 'lead_response', 'support_faq'],
  },
  {
    key: 'salon', label: 'Salón / wellness',
    aliases: ['salon', 'hairdresser', 'kadernictvo', 'barber', 'friseur', 'spa', 'beauty',
      'frisor', 'frisör', 'kampaamo', 'kosmetik', 'nail'],
    osm: ['shop=hairdresser', 'shop=beauty', 'leisure=spa'],
    places: ['hair_salon', 'beauty_salon', 'spa'],
    likely_templates: ['ai_receptionist', 'review_request', 'lead_followup'],
  },
  {
    key: 'fitness', label: 'Fitness / štúdio',
    aliases: ['gym', 'fitness', 'posilnovna', 'pilates studio', 'yoga studio', 'pilates', 'yoga', 'crossfit',
      'fitnessstudio', 'treningssenter', 'kuntosali'],
    osm: ['leisure=fitness_centre', 'leisure=sports_centre'],
    places: ['gym', 'fitness_center'],
    likely_templates: ['lead_followup', 'ai_receptionist', 'review_request'],
  },
  {
    key: 'veterinary', label: 'Veterina',
    aliases: ['vet', 'veterinary', 'veterina', 'tierarzt', 'veterinar', 'veterinär', 'dyrlege', 'elainlaakari'],
    osm: ['amenity=veterinary'],
    places: ['veterinary_care'],
    likely_templates: ['ai_receptionist', 'review_request', 'support_faq'],
  },
  {
    key: 'hospitality', label: 'Hotel / reštaurácia',
    aliases: ['hotel', 'restaurant', 'restauracia', 'reštaurácia', 'cafe', 'gasthaus', 'pension',
      'hotell', 'ravintola', 'bistro'],
    osm: ['tourism=hotel', 'tourism=guest_house', 'amenity=restaurant'],
    places: ['hotel', 'restaurant'],
    likely_templates: ['ai_receptionist', 'review_request', 'support_faq'],
  },
  {
    key: 'it_agency', label: 'IT / marketingová agentúra',
    aliases: ['agency', 'agentura', 'agentúra', 'marketing', 'software', 'it company', 'webdesign',
      'werbeagentur', 'byra', 'byrå', 'digital agency', 'consultancy'],
    osm: ['office=it', 'office=advertising_agency', 'office=company'],
    places: ['marketing_agency'],
    likely_templates: ['lead_response', 'quote_followup', 'internal_admin'],
  },
];

/** Zhodí diakritiku aj interpunkciu, aby "zubár", "zubar" a "Zahnarzt"
 *  prechádzali rovnakou cestou. */
const normalize = (s: string) => s
  .toLowerCase()
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/**
 * Nájde kategóriu podľa voľného textu v ktoromkoľvek podporovanom jazyku.
 *
 * Zhoda je na hranici slov, nie na podreťazci. Voľný `includes` sa zdal
 * pohodlný, ale "interpretive dance studio" tak trafilo fitness - a tichý
 * omyl v kategórii znamená celý zoznam nerelevantných firiem.
 */
export function resolveIndustry(input: string): IndustryCategory | null {
  const q = normalize(input);
  if (!q) return null;
  const words = q.split(' ');

  const matches = (alias: string): boolean => {
    const a = normalize(alias);
    if (!a) return false;
    if (q === a) return true;
    // Viacslovný alias musí sedieť ako súvislá sekvencia slov.
    if (a.includes(' ')) return ` ${q} `.includes(` ${a} `);
    // Jednoslovný alias ako celé slovo dopytu.
    if (words.includes(a)) return true;
    // Nemčina a severské jazyky skladajú slová do jedného: Immobilienmakler,
    // Zahnarztpraxis, Steuerberatungskanzlei. Bez tohto by prioritné trhy
    // DACH a Nordics fungovali len na presné tvary. Dĺžkový prah drží mimo
    // krátke bežné slová, ktoré by inak trafili čokoľvek.
    const COMPOUND_MIN = 5;
    if (a.length >= COMPOUND_MIN) return words.some((w) => w.includes(a));
    return false;
  };

  // Zložené slovo môže trafiť viac kategórií naraz ("Steuerberatungskanzlei"
  // obsahuje aj 'kanzlei'). Vyhráva najdlhšia zhoda, teda najšpecifickejší
  // termín - poradie kategórií v poli o ničom nerozhoduje.
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

/** Zoznam pre UI a chybové hlášky. */
export function industryOptions(): Array<{ key: string; label: string }> {
  return INDUSTRIES.map((i) => ({ key: i.key, label: i.label }));
}
