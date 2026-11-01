// Optional Gemini integration. The key stays in this browser and is sent only
// to Google's API, in a request header rather than the URL.

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export const callGemini = async ({ apiKey, model, prompt, image }) => {
  if (!apiKey) throw new Error('Add a Gemini API key in Settings first.');
  const parts = [{ text: prompt }];
  if (image) parts.push({ inline_data: { mime_type: image.mimeType || 'image/jpeg', data: image.data } });
  let res;
  try {
    res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents: [{ parts }] })
    });
  } catch {
    throw new Error('Could not reach Gemini. Check your connection.');
  }
  if (res.status === 429) throw new Error('Gemini rate limit reached. Try again shortly or pick another model in Settings.');
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok || data?.error) throw new Error(data?.error?.message || `Gemini request failed (${res.status}).`);
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) throw new Error('Gemini returned an empty answer.');
  return text;
};

// Pull the first JSON object/array out of a model reply.
export const extractJson = (text) => {
  if (!text) throw new Error('Empty response');
  const cleaned = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const start = cleaned.search(/[[{]/);
  if (start === -1) throw new Error('No JSON found');
  const open = cleaned[start];
  const close = open === '{' ? '}' : ']';
  const end = cleaned.lastIndexOf(close);
  if (end <= start) throw new Error('No JSON found');
  return JSON.parse(cleaned.slice(start, end + 1));
};

const categoryIndex = (categories) => JSON.stringify(categories.map((c) => ({ id: c.id, name: c.name })));

const compactContext = (categories, transactions, count = 40) => JSON.stringify({
  budgets: categories.map((c) => ({ id: c.id, name: c.name, limit: c.limit, left: c.balance, frequency: c.frequency })),
  recent: transactions.filter((t) => t.type !== 'system').slice(0, count).map((t) => ({
    date: t.date?.slice(0, 10), amount: t.amount, type: t.type || 'expense', category: t.categoryName, note: t.description
  }))
});

export const prompts = {
  parseEntry: (text, categories) =>
    `Extract one budget entry from this text: "${text}". Reply with JSON only: {"amount": number, "description": string, "categoryId": string, "type": "expense" | "income"}. Choose categoryId from: ${categoryIndex(categories)}.`,
  receipt: (categories) =>
    `Read this receipt. Reply with JSON only: {"amount": number (the total), "description": string (store name), "categoryId": string}. Choose categoryId from: ${categoryIndex(categories)}.`,
  chat: (question, categories, transactions, currency) =>
    `You are a concise, practical budgeting assistant. Currency symbol: ${currency}. Budget data: ${compactContext(categories, transactions)}. Question: ${question}. Answer in short markdown (use **bold** for key numbers, short bullet lists).`,
  reportCard: (categories, transactions, currency) =>
    `Write a monthly budget report card. Currency symbol: ${currency}. Give an overall grade (A–F), then 3 wins, 3 leaks and 1 strategy, using **bold** headers and short bullets. Data: ${compactContext(categories, transactions, 120)}`,
  tuneUp: (categories, transactions) =>
    `Audit these budgets against recent spending and suggest new limits. Reply with JSON only: [{"id": string, "newLimit": number, "reason": string}] using the budget ids given. Only include budgets that should change. Data: ${compactContext(categories, transactions, 80)}`
};

export const quickQuestions = (currency = '$') => [
  'Where is most of my money going?',
  `Can I afford a ${currency}100 purchase this week?`,
  'Give me 3 honest truths about my spending.',
  'Project my balances for next week.',
  'How can I cut costs without being miserable?'
];

export const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result);
    resolve({ data: result.split(',')[1], mimeType: file.type || 'image/jpeg' });
  };
  reader.onerror = () => reject(new Error('Could not read that image.'));
  reader.readAsDataURL(file);
});
