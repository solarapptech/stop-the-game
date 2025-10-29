const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const cache = new Map();

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const callWithRetry = async (payload, maxRetries = 3) => {
  let attempt = 0;
  for (;;) {
    try {
      return await openai.chat.completions.create(payload);
    } catch (err) {
      const status = err && (err.status || err.statusCode);
      const code = err && (err.code || (err.error && err.error.code));
      const headers = (err && err.headers) || {};
      if ((status === 429 || code === 'rate_limit_exceeded') && attempt < maxRetries) {
        let delayMs = 20000;
        const raMs = parseInt(headers['retry-after-ms']);
        const ra = parseInt(headers['retry-after']);
        if (!Number.isNaN(raMs)) delayMs = raMs;
        else if (!Number.isNaN(ra)) delayMs = ra * 1000;
        await wait(delayMs);
        attempt += 1;
        continue;
      }
      throw err;
    }
  }
};

const validateAnswers = async (category, letter, answer) => {
  try {
    const a = String(answer || '').trim();
    if (!a || a.length < 2) {
      return false;
    }
    if (a.charAt(0).toUpperCase() !== String(letter || '').toUpperCase()) {
      return false;
    }
    const key = `${String(category || '')}|${String(letter || '')}|${a.toLowerCase()}`;
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && cached.expires > now) {
      return cached.value;
    }
    const prompt = `Is "${a}" a valid answer for the category "${category}" in the game Stop/Tutti Frutti? 
    The answer must:
    1. Start with the letter "${String(letter || '').toUpperCase()}"
    2. Be a real word or name that fits the category
    3. Be spelled correctly (minor variations acceptable)
    
    Respond with only "true" or "false".`;

    const completion = await callWithRetry({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a game validator for Stop/Tutti Frutti. Respond only with "true" or "false".'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 10
    });

    const content = (completion && completion.choices && completion.choices[0] && completion.choices[0].message && completion.choices[0].message.content) || '';
    const response = String(content).toLowerCase().trim();
    const result = response === 'true';
    cache.set(key, { value: result, expires: now + 10 * 60 * 1000 });
    return result;
  } catch (error) {
    console.error('OpenAI validation error:', error);
    const a = String(answer || '').trim();
    return a.length >= 2 && a.charAt(0).toUpperCase() === String(letter || '').toUpperCase();
  }
};

const validateMultipleAnswers = async (answers, letter) => {
  try {
    const out = [];
    for (const answer of answers) {
      const isValid = await validateAnswers(answer.category, letter, answer.answer);
      out.push({ ...answer, isValid });
    }
    return out;
  } catch (error) {
    console.error('Multiple validation error:', error);
    return answers.map(answer => ({
      ...answer,
      isValid: (() => {
        const a = String(answer.answer || '').trim();
        return a && a.length >= 2 && a.charAt(0).toUpperCase() === String(letter || '').toUpperCase();
      })()
    }));
  }
};

module.exports = {
  validateAnswers,
  validateMultipleAnswers
};
