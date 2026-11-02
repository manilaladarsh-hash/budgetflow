// Merchant clean-up and category guessing for imported / Apple Pay entries.
// Everything here is pure and works offline.

// ---- Description clean-up ----

const PREFIXES = [
  /^(?:POS|OPOS|IDP|INTERAC|VISA DEBIT|DEBIT CARD|MASTERCARD DEBIT|CONTACTLESS|APPLE PAY|GOOGLE PAY|E-?COMMERCE)\s+(?:PURCHASE|PUR|RETAIL PURCHASE|PMT|PAYMENT)?\s*[-:#]?\s*/,
  /^(?:PURCHASE|RETAIL PURCHASE|POINT OF SALE|ACHAT|PAIEMENT DIRECT|ACHAT PAR CARTE)\s*[-:#]?\s*/,
  /^(?:SQ|TST|SP|PY|PP|DD|PAYPAL|IZ|ZETTLE|CLV|CKE|SUMUP|HLU|HELCIM|WPY|BT|ZEFFY|MOL)\s*[*/]\s*/,
  /^(?:FPOS|C-IDP PURCHASE-\d+|WWW|PRE-?AUTH(?:ORIZED)?(?:\s+DEBIT)?|PAP)\s*[-:#]?\s*/
];

const PROVINCES = new Set(['ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'PEI', 'YT', 'NT', 'NU', 'CA', 'CAN', 'CANADA', 'US', 'USA']);
const CITY_PREFIX = new Set(['NORTH', 'SOUTH', 'EAST', 'WEST', 'ST', 'STE', 'SAINT', 'SAINTE', 'NEW', 'PORT', 'FORT', 'RICHMOND', 'NIAGARA', 'THUNDER', 'RED', 'SAULT', 'PRINCE', 'MONT', 'POINTE', 'LA', 'LE', 'GRANDE', 'SHERWOOD', 'STONEY', 'WHITE', 'MAPLE', 'DEEP', 'ELLIOT', 'BLUE', 'SPRUCE', 'MEDICINE', 'CAPE', 'GRAND']);

// Well-known merchants whose bank descriptors are messy.
const ALIASES = [
  [/^(?:AMZN|AMAZON)\b(?!.*PRIME)/, 'Amazon'],
  [/^(?:AMZN|AMAZON).*PRIME/, 'Amazon Prime'],
  [/UBER\s*\*?\s*EATS|UBEREATS/, 'Uber Eats'],
  [/^UBER\b/, 'Uber'],
  [/^LYFT\b/, 'Lyft'],
  [/^APPLE\.?COM\/?BILL|^APPLE\.COM\b|^ITUNES/, 'Apple'],
  [/^GOOGLE\s*\*?\s*(YOUTUBE|YT)/, 'YouTube'],
  [/^GOOGLE\b/, 'Google'],
  [/^NETFLIX/, 'Netflix'],
  [/^SPOTIFY/, 'Spotify'],
  [/^DISNEY/, 'Disney+'],
  [/^TIM\s*HORTON/, 'Tim Hortons'],
  [/^STARBUCKS/, 'Starbucks'],
  [/^MCDONALD/, "McDonald's"],
  [/^A\s?&\s?W\b/, 'A&W'],
  [/PRESTO/, 'PRESTO'],
  [/^LCBO/, 'LCBO'],
  [/^SHOPPERS\s*DRUG/, 'Shoppers Drug Mart'],
  [/^COSTCO\s*GAS/, 'Costco Gas'],
  [/^COSTCO/, 'Costco'],
  [/^DOORDASH|^DD\s*[*/]?\s*DOORDASH/, 'DoorDash'],
  [/^METROLINX|^GO TRANSIT/, 'GO Transit'],
  [/^HELLOFRESH/, 'HelloFresh'],
  [/^ALIEXPRESS/, 'AliExpress'],
  [/^REMITLY/, 'Remitly'],
  [/GST\/TPS|GST CREDIT|GST\/HST/, 'GST/HST credit'],
  [/^CANADA\s+PRO\b|^EFT CREDIT CANADA$/, 'Government of Canada'],
  [/^CINEPLEX/, 'Cineplex'],
  [/^SKIP\s*THE\s*DISHES|^SKIPTHEDISHES/, 'SkipTheDishes'],
  [/^WAL-?MART|^WALMART/, 'Walmart'],
  [/^CANADIAN TIRE GAS|^CDN TIRE GAS/, 'Canadian Tire Gas'],
  [/^CANADIAN TIRE|^CDN TIRE/, 'Canadian Tire'],
  [/^DOLLARAMA/, 'Dollarama'],
  [/^NO\s*FRILLS/, 'No Frills'],
  [/^LOBLAWS?/, 'Loblaws'],
  [/^REAL CDN SUPERSTORE|^SUPERSTORE/, 'Superstore'],
  [/^FARM\s*BOY/, 'Farm Boy'],
  [/^FOOD\s*BASICS/, 'Food Basics'],
  [/^SOBEYS/, 'Sobeys'],
  [/^METRO\b/, 'Metro'],
  [/^ROGERS/, 'Rogers'],
  [/^BELL\s*(CANADA|MOBILITY|MTS)?\b/, 'Bell'],
  [/^TELUS/, 'Telus'],
  [/^FIDO/, 'Fido'],
  [/^KOODO/, 'Koodo'],
  [/^PETRO-?\s?CAN/, 'Petro-Canada'],
  [/^ESSO/, 'Esso'],
  [/^SHELL\b/, 'Shell'],
  [/^BEST\s*BUY/, 'Best Buy'],
  [/^IKEA/, 'IKEA'],
  [/^WINNERS/, 'Winners'],
  [/^HOME\s*DEPOT/, 'Home Depot'],
  [/^STAPLES/, 'Staples'],
  [/^INDIGO|^CHAPTERS/, 'Indigo'],
  [/^CINEPLEX/, 'Cineplex'],
  [/^AIR\s*CANADA/, 'Air Canada'],
  [/^WESTJET/, 'WestJet'],
  [/^AIRBNB/, 'Airbnb'],
  [/^TTC\b/, 'TTC'],
  [/^GOODLIFE/, 'GoodLife Fitness'],
  [/^OPENAI|^CHATGPT/, 'OpenAI'],
  [/^ANTHROPIC|^CLAUDE\.AI/, 'Anthropic'],
  [/^MICROSOFT|^MSFT/, 'Microsoft'],
  [/^STEAM(?:GAMES|POWERED)?/, 'Steam'],
  [/^PAYPAL\b/, 'PayPal']
];

const titleCase = (s) => s.toLowerCase()
  .replace(/(^|[\s/&(-])([a-z])/g, (_, p, c) => p + c.toUpperCase())
  .replace(/\b(Ttc|Lcbo|Hbc|Td|Rbc|Bmo|Cibc|Kfc|Atm|Ups|Dhl|Saq|Ymca|Mec|Ca|Usa)\b/g, (m) => m.toUpperCase())
  .replace(/\.(Com|Ca|Net|Org|Io|Co)\b/g, (m) => m.toLowerCase())
  .replace(/\bMc([a-z])/g, (_, c) => `Mc${c.toUpperCase()}`);

const isWordish = (w) => /^[A-Z][A-Z'.-]*$/.test(w) && !w.includes('.');

// Cleans a raw bank description into a readable merchant name.
const GENERIC = { SPEND: 'Card purchase', IN: 'Interest', INTEREST: 'Interest', SC: 'Service charge' };

// "INTERAC ETRNSFR SENT  JOHN SMITH  2026..." -> "E-Transfer to John Smith"
const eTransferName = (s) => {
  const m = s.match(/(?:INTERAC\s+)?(?:E-?\s?TRA?NS?FE?R|ETRNSFR|E-TFR)(?:®)?\s*(SENT|SEND|RECVD|RECEIVED|AD RECVD|AUTODEPOSIT|AUTO-DEPOSIT|TO:?|FROM:?|REQUEST)?\s*(.*)$/);
  if (!m) return null;
  const dir = /SENT|SEND|TO/.test(m[1] || '') ? 'to' : m[1] ? 'from' : '';
  const name = (m[2] || '')
    .replace(/\b(?=[A-Z0-9]*\d)[A-Z0-9]{10,}\b/g, ' ') // reference codes
    .replace(/[^A-Z' .&-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const title = name ? name.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, p, c) => p + c.toUpperCase()) : '';
  if (!title) return dir === 'to' ? 'E-Transfer sent' : dir === 'from' ? 'E-Transfer received' : 'E-Transfer';
  return `E-Transfer${dir ? ` ${dir}` : ''} ${title}`;
};

export const cleanMerchant = (raw) => {
  const original = String(raw || '').toUpperCase().trim()
    .replace(/^\s*\[[A-Z]{2}\]\s*/, '') // BMO codes like [CW], [DS]
    .replace(/\s*\(EXECUTED AT [^)]*\)/, '')
    .trim();
  if (!original) return String(raw || '').trim() === '' ? '' : (GENERIC[String(raw).replace(/[^A-Z]/gi, '').toUpperCase()] || '');
  if (GENERIC[original]) return GENERIC[original];
  const collapsed = original.replace(/\s+/g, ' ');
  if (/^TF\s+\d{12,}/.test(collapsed)) return 'Credit card payment';
  if (/^TF\s+\d{4}#/.test(collapsed)) return 'Transfer between accounts';
  if (/^TRSF FROM\/DE ACCT/.test(collapsed)) return 'Payment from bank account';
  const early = ALIASES.find(([re]) => re.test(collapsed));
  if (early && /^(?:CANADA|GST|EFT)/.test(collapsed)) return early[1];
  const et = eTransferName(original.replace(/\s+/g, ' '));
  if (et) return et;
  // Banks often pad the location into its own column-like segment.
  let s = original.split(/\s{2,}|\t/)[0] || original;
  for (let i = 0; i < 3; i += 1) PREFIXES.forEach((re) => { s = s.replace(re, ''); });
  s = s
    .replace(/\b(?:X{2,}|\*{2,})\d{2,4}\b/g, ' ') // masked card numbers
    .replace(/\*[A-Z0-9]{6,}\b/g, ' ') // AMZN Mktp CA*2K4LL1234
    .replace(/\b\d{6,}\b/g, ' ') // long reference numbers
    .replace(/\b\d+\.\d{2}\b/g, ' ') // amounts echoed in the descriptor
    .replace(/\b[A-Z]{1,2}\d{4,}\b/g, ' ') // terminal codes like C12345
    .replace(/\(?\d{3}\)?[- ]?\d{3}[- ]\d{4}\b/g, ' ') // phone numbers
    .replace(/#\s?\d+\b/g, ' ') // store numbers "#1234"
    .replace(/\b(?:STORE|STR|LOC|UNIT)\s?\d+\b/g, ' ')
    .replace(/[*#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const alias = ALIASES.find(([re]) => re.test(s));
  if (alias) return alias[1];
  let words = s.split(' ');
  // Trailing "TORONTO ON", "NORTH YORK ON", or a bare province code.
  if (words.length > 2 && PROVINCES.has(words[words.length - 1])) {
    words.pop();
    if (words.length > 2 && isWordish(words[words.length - 1])) {
      words.pop();
      if (words.length > 2 && CITY_PREFIX.has(words[words.length - 1])) words.pop();
    }
  } else if (words.length > 1 && PROVINCES.has(words[words.length - 1]) && words[words.length - 1].length >= 2 && words[words.length - 1] !== 'CA') {
    words.pop();
  }
  // Trailing store numbers ("LOBLAWS 1029").
  while (words.length > 1 && /^\d{1,5}$/.test(words[words.length - 1])) words.pop();
  s = words.join(' ').trim() || original;
  return titleCase(s);
};

// Stable key used for rules and duplicate checks: letters only, first words.
// Descriptions that say nothing about the merchant can't be learned from.
const UNLEARNABLE = new Set(['CARD PURCHASE', 'PURCHASE', 'DEBIT', 'CREDIT', 'WITHDRAWAL', 'DEPOSIT', 'PAYMENT', 'TRANSFER', 'INTEREST', 'POS', 'ATM', 'FEE', 'SERVICE CHARGE', 'E TRANSFER', 'E TRANSFER TO', 'E TRANSFER FROM', 'MISC', 'OTHER']);

export const merchantKey = (raw) => {
  const cleaned = cleanMerchant(raw).toUpperCase().replace(/[^A-Z0-9& ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const words = cleaned.split(' ').filter((w) => w && !/^\d+$/.test(w));
  // E-transfers: keep direction + person ("E TRANSFER TO JOHN SMITH").
  const key = words.slice(0, words[0] === 'E' && words[1] === 'TRANSFER' ? 5 : 3).join(' ');
  return UNLEARNABLE.has(key) ? '' : key;
};

// ---- Category guessing ----

// Known merchants (mainly Canadian) grouped by spending concept.
const CONCEPTS = {
  grocery: {
    synonyms: ['grocery', 'groceries', 'supermarket', 'food'],
    words: ['HELLOFRESH', 'GOODFOOD', 'LOBLAW', 'NO FRILLS', 'METRO', 'SOBEYS', 'FOOD BASICS', 'FRESHCO', 'COSTCO', 'FARM BOY', 'T&T', 'LONGO', 'ZEHRS', 'FORTINOS', 'SUPERSTORE', 'IGA', 'MAXI', 'PROVIGO', 'SAVE ON FOODS', 'SAVE-ON', 'WHOLE FOODS', 'INSTACART', 'VALU-MART', 'YOUR INDEPENDENT', 'SAFEWAY', 'WALMART', 'GIANT TIGER', 'ADONIS', 'NATIONS FRESH', 'BULK BARN', 'GROCERY', 'SUPERMARKET', 'MARKET', 'VOILA', 'PC EXPRESS', 'FOODLAND', 'COOP', 'CO-OP', 'TRADER JOE', 'ALDI', 'KROGER']
  },
  coffee: {
    synonyms: ['coffee', 'cafe', 'café', 'eating out', 'dining', 'food'],
    words: ['TIM HORTON', 'STARBUCKS', 'BAKERY', 'PATISSERIE', 'BOULANGERIE', 'DONUT', 'BUBBLE TEA', 'CHATIME', 'GONG CHA', 'SECOND CUP', 'BALZAC', 'COFFEE', 'CAFE', 'ESPRESSO', 'DAVIDSTEA', 'BLENZ', 'COBS', 'DUNKIN', 'PILOT COFFEE', 'BLACK CANARY']
  },
  dining: {
    synonyms: ['dining', 'restaurant', 'eating out', 'takeout', 'food', 'fun'],
    words: ['MCDONALD', 'STEAK', 'DELI', 'EATERY', 'CANTINA', 'TAVERN', 'UBER EATS', 'UBEREATS', 'DOORDASH', 'SKIP THE DISHES', 'SKIPTHEDISHES', 'A&W', 'A & W', 'SUBWAY', 'PIZZA', 'RESTAURANT', 'SUSHI', 'CHIPOTLE', 'HARVEY', 'WENDY', 'BURGER', 'KFC', 'POPEYES', 'MARY BROWN', 'OSMOW', 'FRESHII', 'BARBURRITO', 'MUCHO', 'PHO', 'RAMEN', 'BISTRO', 'GRILL', 'KITCHEN', 'TACO', 'SHAWARMA', 'THAI', 'NOODLE', 'DINER', 'PUB', 'BAR ', 'BREWERY', 'BOSTON PIZZA', 'EAST SIDE MARIO', 'MONTANA', 'KELSEY', 'SWISS CHALET', 'ST-HUBERT', 'DAIRY QUEEN', 'DOMINO', 'PIZZA PIZZA', 'PIZZA HUT', 'PIZZAIOLO', 'FANTUAN', 'RITUAL']
  },
  transport: {
    synonyms: ['transport', 'transit', 'commute', 'gas', 'fuel', 'car', 'auto', 'travel'],
    words: ['PRESTO', 'TTC', 'GO TRANSIT', 'METROLINX', 'OC TRANSPO', 'STM ', 'COMPASS', 'TRANSLINK', 'UBER TRIP', 'UBER CANADA', 'UBER *TRIP', 'LYFT', 'PETRO', 'ESSO', 'SHELL', 'PIONEER', 'ULTRAMAR', 'HUSKY', 'CHEVRON', 'MOBIL', 'SUNOCO', 'IRVING', 'CANADIAN TIRE GAS', 'GAS BAR', 'COSTCO GAS', 'IMPARK', 'GREEN P', 'PARKING', 'INDIGO PARK', 'EASYPARK', 'HONK', 'PAYBYPHONE', '407 ETR', 'BIXI', 'BIKE SHARE', 'ZIPCAR', 'COMMUNAUTO', 'EVO CAR', 'FLEXITI']
  },
  phone: {
    synonyms: ['phone', 'mobile', 'cell', 'internet', 'bills', 'utilities'],
    words: ['ROGERS', 'BELL CANADA', 'BELL MOBILITY', 'TELUS', 'FIDO', 'KOODO', 'VIRGIN PLUS', 'VIRGIN MOBILE', 'FREEDOM MOBILE', 'PUBLIC MOBILE', 'CHATR', 'LUCKY MOBILE', 'VIDEOTRON', 'SHAW', 'COGECO', 'EASTLINK', 'TEKSAVVY', 'START.CA', 'DISTRIBUTEL', 'FIZZ']
  },
  subscriptions: {
    synonyms: ['subscriptions', 'subscription', 'streaming', 'entertainment', 'fun', 'shopping'],
    words: ['GOOGLE', 'NETFLIX', 'SPOTIFY', 'DISNEY', 'CRAVE', 'PRIME VIDEO', 'AMAZON PRIME', 'YOUTUBE', 'APPLE.COM', 'APPLE COM BILL', 'ITUNES', 'GOOGLE STORAGE', 'GOOGLE ONE', 'GOOGLE PLAY', 'MICROSOFT', 'XBOX', 'PLAYSTATION', 'STEAM', 'NINTENDO', 'AUDIBLE', 'PATREON', 'OPENAI', 'CHATGPT', 'ANTHROPIC', 'CLAUDE.AI', 'DROPBOX', 'ADOBE', 'PARAMOUNT', 'APPLE TV', 'TWITCH', 'NOTION', 'ICLOUD']
  },
  shopping: {
    synonyms: ['shopping', 'clothes', 'clothing', 'personal', 'misc', 'household', 'stuff'],
    words: ['STYLEVANA', 'FRAGRANCENET', 'YESSTYLE', 'GOLF TOWN', 'AMAZON', 'AMZN', 'BEST BUY', 'WINNERS', 'MARSHALLS', 'HOMESENSE', 'H&M', 'UNIQLO', 'ZARA', 'IKEA', 'CANADIAN TIRE', 'DOLLARAMA', 'DOLLAR TREE', 'HOME DEPOT', 'RONA', 'LOWE', 'STAPLES', 'INDIGO', 'CHAPTERS', 'SPORT CHEK', 'SPORTCHEK', 'MEC ', 'ROOTS', 'GAP ', 'OLD NAVY', 'SEPHORA', 'LULULEMON', 'ARITZIA', 'SIMONS', 'HUDSON', 'HBC', 'SHEIN', 'TEMU', 'ALIEXPRESS', 'ETSY', 'EBAY', 'APPLE STORE', 'MICHAELS', 'MARK\'S', 'NIKE', 'ADIDAS', 'TOYS', 'PET VALU', 'PETSMART', 'STRUCTUBE']
  },
  health: {
    synonyms: ['health', 'pharmacy', 'medical', 'fitness', 'gym', 'wellness', 'personal care'],
    words: ['SHOPPERS DRUG', 'REXALL', 'PHARMA', 'PHARMACY', 'JEAN COUTU', 'LONDON DRUGS', 'GUARDIAN', 'DENTAL', 'DENTIST', 'CLINIC', 'MEDICAL', 'PHYSIO', 'OPTOMETR', 'GOODLIFE', 'FIT4LESS', 'PLANET FITNESS', 'ANYTIME FITNESS', 'YMCA', 'YOGA', 'CROSSFIT', 'BARBER', 'SALON', 'SPA ']
  },
  housing: {
    synonyms: ['rent', 'housing', 'home', 'mortgage'],
    words: ['RENT', 'PROPERTY MGMT', 'PROPERTY MANAGEMENT', 'MORTGAGE', 'CONDO FEE', 'STRATA', 'REALTY', 'APARTMENTS']
  },
  utilities: {
    synonyms: ['utilities', 'bills', 'hydro', 'electricity', 'home'],
    words: ['HYDRO', 'ENBRIDGE', 'ALECTRA', 'FORTISBC', 'FORTIS', 'EPCOR', 'ENMAX', 'ATCO', 'NB POWER', 'NOVA SCOTIA POWER', 'SASKPOWER', 'MANITOBA HYDRO', 'WATER BILL', 'RELIANCE HOME', 'INSURANCE', 'INTACT', 'SQUARE ONE INS', 'TD INSURANCE', 'SONNET', 'BELAIR']
  },
  travel: {
    synonyms: ['travel', 'trips', 'trip', 'vacation', 'holiday'],
    words: ['FLIX', 'AIR CANADA', 'WESTJET', 'PORTER', 'FLAIR', 'LYNX', 'SWOOP', 'AIRBNB', 'EXPEDIA', 'BOOKING.COM', 'HOTEL', 'MARRIOTT', 'HILTON', 'HYATT', 'VIA RAIL', 'FLIXBUS', 'MEGABUS', 'GREYHOUND', 'AIRPORT', 'DUTY FREE']
  },
  alcohol: {
    synonyms: ['alcohol', 'drinks', 'fun', 'entertainment'],
    words: ['LCBO', 'BEER STORE', 'SAQ', 'BC LIQUOR', 'WINE RACK', 'LIQUOR', 'WINE']
  },
  entertainment: {
    synonyms: ['entertainment', 'fun', 'leisure', 'hobbies'],
    words: ['TICKET', 'RESIDENT ADVISOR', 'CINEPLEX', 'LANDMARK CINEMA', 'TICKETMASTER', 'EVENTBRITE', 'BOWLING', 'MUSEUM', 'THEATRE', 'THEATER', 'CONCERT', 'GAMES']
  },
  education: {
    synonyms: ['education', 'school', 'tuition', 'books', 'learning'],
    words: ['MCMASTER ACCT', 'UNIVERSITY', 'COLLEGE', 'TUITION', 'COURSERA', 'UDEMY', 'BOOKSTORE']
  },
  fees: {
    synonyms: ['fees', 'bank', 'bills', 'misc'],
    words: ['CROSS-BORDER FEE', 'SERVICE CHARGE', 'ANNUAL FEE', 'NSF', 'OVERDRAFT', 'ATM FEE', 'MONTHLY FEE', 'INTEREST CHARGE', 'FOREIGN TRANSACTION FEE']
  },
  remittance: {
    synonyms: ['family', 'remittance', 'support', 'sent abroad', 'transfers'],
    words: ['REMITLY', 'WISE', 'WESTERN UNION', 'MONEYGRAM', 'INTERNATIONAL TRANSFER', 'XOOM']
  }
};

// Bank-supplied category labels (Amex, Capital One, Tangerine…) -> concept.
const BANK_CATEGORY_HINTS = [
  [/grocer|supermarket/i, 'grocery'],
  [/restaurant|dining|fast food|food|bar/i, 'dining'],
  [/coffee/i, 'coffee'],
  [/gas|fuel|transport|transit|auto|parking|taxi|rideshare/i, 'transport'],
  [/phone|telecom|internet|cable/i, 'phone'],
  [/utilit|insurance/i, 'utilities'],
  [/health|pharm|medical|fitness|personal care/i, 'health'],
  [/travel|airline|hotel|lodging/i, 'travel'],
  [/entertain|recreation/i, 'entertainment'],
  [/merchandise|shopping|retail|general|home improvement|department/i, 'shopping'],
  [/subscription|digital|software|streaming/i, 'subscriptions'],
  [/education/i, 'education']
];

const ICON_CONCEPT = {
  apple: 'grocery', utensils: 'dining', coffee: 'coffee', car: 'transport', fuel: 'transport', bus: 'transport', train: 'transport',
  smartphone: 'phone', wifi: 'phone', 'shopping-bag': 'shopping', shirt: 'shopping', home: 'housing', zap: 'utilities',
  heart: 'health', stethoscope: 'health', pill: 'health', dumbbell: 'health', plane: 'travel', tv: 'subscriptions',
  film: 'entertainment', 'gamepad-2': 'entertainment', popcorn: 'entertainment', book: 'education', 'graduation-cap': 'education'
};

// Keywords match at a word start; short ones (<= 4 letters, e.g. "RENT",
// "TTC") must also end at a word boundary so "PARENT" or "RENTAL" don't hit.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MATCHERS = Object.entries(CONCEPTS).flatMap(([concept, { words }]) => words.map((raw) => {
  const w = raw.trim();
  return { concept, len: w.length, re: new RegExp(`(?:^|[^A-Z0-9])${escapeRe(w)}${w.length <= 4 ? '(?![A-Z0-9])' : ''}`) };
}));

export const conceptForText = (text) => {
  const s = String(text || '').toUpperCase();
  let best = null;
  MATCHERS.forEach((m) => {
    // Longest keyword wins, so "UBER EATS" beats "UBER CANADA" etc.
    if ((!best || m.len > best.len) && m.re.test(s)) best = m;
  });
  return best?.concept || null;
};

export const conceptForBankCategory = (label) => {
  if (!label) return null;
  const hit = BANK_CATEGORY_HINTS.find(([re]) => re.test(label));
  return hit ? hit[1] : null;
};

// Pick the user's budget that best fits a concept.
export const categoryForConcept = (concept, categories) => {
  if (!concept || !CONCEPTS[concept]) return null;
  const { synonyms } = CONCEPTS[concept];
  for (const syn of synonyms) {
    const hit = categories.find((c) => c.name.toLowerCase().includes(syn));
    if (hit) return hit;
  }
  const byIcon = categories.find((c) => ICON_CONCEPT[c.icon] === concept);
  return byIcon || null;
};

// ---- Rules ----
// A rule: { id, match, mode: 'merchant' | 'contains', categoryId, action: 'categorize' | 'skip', hits, updatedAt }

export const ruleMatches = (rule, key, rawDescription) => {
  if (!rule?.match) return false;
  if (rule.mode === 'contains') return String(rawDescription || '').toUpperCase().includes(String(rule.match).toUpperCase())
    || key.includes(String(rule.match).toUpperCase());
  return key === rule.match;
};

export const findRule = (rules, key, rawDescription) => {
  const exact = rules.find((r) => r.mode !== 'contains' && ruleMatches(r, key, rawDescription));
  if (exact) return exact;
  // Longest "contains" rule wins.
  return rules
    .filter((r) => r.mode === 'contains' && ruleMatches(r, key, rawDescription))
    .sort((a, b) => String(b.match).length - String(a.match).length)[0] || null;
};

// Build a lookup of merchant -> most used category from past entries.
export const historyIndex = (transactions) => {
  const counts = new Map();
  transactions.forEach((t) => {
    if (!t || t.categoryId === 'system' || (t.type && t.type !== 'expense')) return;
    const key = merchantKey(t.originalDescription || t.description);
    if (!key) return;
    const per = counts.get(key) || new Map();
    per.set(t.categoryId, (per.get(t.categoryId) || 0) + 1);
    counts.set(key, per);
  });
  const index = new Map();
  counts.forEach((per, key) => {
    const [categoryId] = [...per.entries()].sort((a, b) => b[1] - a[1])[0];
    index.set(key, categoryId);
  });
  return index;
};

// Suggest a budget for a description. Returns { categoryId, source, skip } or null.
// source: 'rule' | 'history' | 'bank' | 'guess'
export const suggestCategory = ({ description, bankCategory, categories, rules = [], history }) => {
  const key = merchantKey(description);
  const valid = (id) => categories.some((c) => c.id === id);
  const rule = findRule(rules, key, description);
  if (rule) {
    if (rule.action === 'skip') return { categoryId: null, source: 'rule', skip: true, ruleId: rule.id };
    if (valid(rule.categoryId)) return { categoryId: rule.categoryId, source: 'rule', ruleId: rule.id };
  }
  const exactBudget = bankCategory && categories.find((c) => c.name.toLowerCase() === String(bankCategory).trim().toLowerCase());
  if (exactBudget) return { categoryId: exactBudget.id, source: 'bank' };
  const fromHistory = history?.get(key);
  if (fromHistory && valid(fromHistory)) return { categoryId: fromHistory, source: 'history' };
  // The cleaned name ("Uber Eats") is a better hint than the raw descriptor.
  const byText = categoryForConcept(conceptForText(cleanMerchant(description)) || conceptForText(description), categories);
  if (byText) return { categoryId: byText.id, source: 'guess' };
  const byBank = categoryForConcept(conceptForBankCategory(bankCategory), categories);
  if (byBank) return { categoryId: byBank.id, source: 'bank' };
  // A budget literally named after the merchant ("Netflix", "Gym").
  const named = categories.find((c) => c.name.length >= 3 && key.includes(c.name.toUpperCase()));
  if (named) return { categoryId: named.id, source: 'guess' };
  return null;
};

// Upsert a merchant rule (learned from a choice the user made).
export const learnRule = (rules, { key, categoryId, action = 'categorize' }) => {
  if (!key) return rules;
  const now = new Date().toISOString();
  const existing = rules.find((r) => r.mode !== 'contains' && r.match === key);
  if (existing) {
    if (existing.categoryId === categoryId && existing.action === action) return rules;
    return rules.map((r) => (r === existing ? { ...r, categoryId, action, updatedAt: now } : r));
  }
  return [...rules, { id: `r${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, match: key, mode: 'merchant', categoryId, action, hits: 0, updatedAt: now }];
};
