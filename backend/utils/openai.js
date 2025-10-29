const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const cache = new Map();

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
]);

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

const validateBatchAnswersFast = async (items, letter) => {
  try {
    const start = Date.now();
    const result = {};
    const toValidate = [];
    const indexMap = [];
    for (const item of items) {
      const a = String(item?.answer || '').trim();
      const k = `${String(item?.category || '')}|${String(letter || '')}|${a.toLowerCase()}`;
      const cached = cache.get(k);
      if (cached && cached.expires > Date.now()) {
        result[k] = cached.value;
      } else {
        toValidate.push({ category: String(item?.category || ''), answer: a });
        indexMap.push(k);
      }
    }
    const cacheHits = items.length - toValidate.length;
    console.log(`[AI] Batch validation start: total=${items.length}, toValidate=${toValidate.length}, cacheHits=${cacheHits}, model=${MODEL}`);
    if (toValidate.length === 0) {
      console.log(`[AI] Batch validation done: 0 network calls in ${Date.now() - start}ms`);
      return result;
    }
    const listLines = toValidate.map((it, i) => `${i + 1}) category: "${it.category}", answer: "${it.answer}"`).join('\n');
    const userContent = `Letter: "${String(letter || '').toUpperCase()}"\nFor each item below, reply with a JSON array of booleans in the same order.\nRules: starts with the letter, fits the category, real word/name, reasonable spelling.\n\nItems:\n${listLines}`;
    const payload = {
      model: MODEL,
      messages: [
        { role: 'system', content: 'You validate answers for Stop/Tutti Frutti. Reply ONLY with a JSON array of booleans, no extra text.' },
        { role: 'user', content: userContent }
      ],
      temperature: 0,
      max_tokens: Math.max(20, toValidate.length * 5)
    };
    let completion;
    try {
      const timeoutMs = parseInt(process.env.AI_BATCH_TIMEOUT_MS || '2000');
      completion = await withTimeout(callWithRetry(payload, 0), timeoutMs);
    } catch (err) {
      console.error('[AI] Batch validation error/timeout, falling back to heuristic:', err && err.message ? err.message : err);
      for (let i = 0; i < toValidate.length; i++) {
        const it = toValidate[i];
        const v = it.answer && it.answer.length >= 2 && it.answer.charAt(0).toUpperCase() === String(letter || '').toUpperCase();
        const k = indexMap[i];
        result[k] = v;
        cache.set(k, { value: v, expires: Date.now() + 10 * 60 * 1000 });
      }
      console.log(`[AI] Batch fallback heuristic applied for ${toValidate.length} items in ${Date.now() - start}ms`);
      return result;
    }
    let content = '';
    try {
      content = (completion && completion.choices && completion.choices[0] && completion.choices[0].message && completion.choices[0].message.content) || '';
      let jsonText = content.trim();
      if (jsonText.startsWith('```')) {
        const first = jsonText.indexOf('\n');
        jsonText = jsonText.slice(first + 1);
        const lastFence = jsonText.lastIndexOf('```');
        if (lastFence >= 0) jsonText = jsonText.slice(0, lastFence);
        jsonText = jsonText.trim();
      }
      const arr = JSON.parse(jsonText);
      if (!Array.isArray(arr)) throw new Error('non-array');
      for (let i = 0; i < arr.length && i < indexMap.length; i++) {
        const val = !!arr[i];
        const k = indexMap[i];
        result[k] = val;
        cache.set(k, { value: val, expires: Date.now() + 10 * 60 * 1000 });
      }
      for (let i = arr.length; i < indexMap.length; i++) {
        const it = toValidate[i];
        const v = it.answer && it.answer.length >= 2 && it.answer.charAt(0).toUpperCase() === String(letter || '').toUpperCase();
        const k = indexMap[i];
        result[k] = v;
        cache.set(k, { value: v, expires: Date.now() + 10 * 60 * 1000 });
      }
      console.log(`[AI] Batch validation done in ${Date.now() - start}ms. validated=${toValidate.length}, cacheHits=${cacheHits}`);
      return result;
    } catch (parseErr) {
      console.error('[AI] Batch parse error, falling back to heuristic:', parseErr && parseErr.message ? parseErr.message : parseErr, 'content=', content);
      for (let i = 0; i < toValidate.length; i++) {
        const it = toValidate[i];
        const v = it.answer && it.answer.length >= 2 && it.answer.charAt(0).toUpperCase() === String(letter || '').toUpperCase();
        const k = indexMap[i];
        result[k] = v;
        cache.set(k, { value: v, expires: Date.now() + 10 * 60 * 1000 });
      }
      console.log(`[AI] Batch fallback heuristic applied for ${toValidate.length} items in ${Date.now() - start}ms`);
      return result;
    }
  } catch (error) {
    console.error('OpenAI batch validation fatal error:', error);
    const out = {};
    for (const item of items) {
      const a = String(item?.answer || '').trim();
      const k = `${String(item?.category || '')}|${String(letter || '')}|${a.toLowerCase()}`;
      const v = a && a.length >= 2 && a.charAt(0).toUpperCase() === String(letter || '').toUpperCase();
      out[k] = v;
      cache.set(k, { value: v, expires: Date.now() + 10 * 60 * 1000 });
    }
    return out;
  }
};

module.exports = {
  validateAnswers,
  validateMultipleAnswers,
  validateBatchAnswersFast
};
