const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const validateAnswers = async (category, letter, answer) => {
  try {
    // Basic validation
    if (!answer || answer.length < 2) {
      return false;
    }

    // Check if answer starts with the correct letter
    if (answer.charAt(0).toUpperCase() !== letter.toUpperCase()) {
      return false;
    }

    // Use OpenAI to validate if the answer is valid for the category
    const prompt = `Is "${answer}" a valid answer for the category "${category}" in the game Stop/Tutti Frutti? 
    The answer must:
    1. Start with the letter "${letter}"
    2. Be a real word or name that fits the category
    3. Be spelled correctly (minor variations acceptable)
    
    Respond with only "true" or "false".`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
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

    const response = completion.choices[0].message.content.toLowerCase().trim();
    return response === 'true';
  } catch (error) {
    console.error('OpenAI validation error:', error);
    // Fallback to basic validation if OpenAI fails
    return answer.length >= 2 && answer.charAt(0).toUpperCase() === letter.toUpperCase();
  }
};

const validateMultipleAnswers = async (answers, letter) => {
  try {
    const validationPromises = answers.map(async (answer) => {
      const isValid = await validateAnswers(answer.category, letter, answer.answer);
      return {
        ...answer,
        isValid
      };
    });

    return await Promise.all(validationPromises);
  } catch (error) {
    console.error('Multiple validation error:', error);
    // Fallback validation
    return answers.map(answer => ({
      ...answer,
      isValid: answer.answer && 
               answer.answer.length >= 2 && 
               answer.answer.charAt(0).toUpperCase() === letter.toUpperCase()
    }));
  }
};

module.exports = {
  validateAnswers,
  validateMultipleAnswers
};
