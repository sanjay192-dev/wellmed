const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ CORS: allow frontend hosted on Vercel
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json());

/**
 * ✅ Classifies if the message is medical-related using OpenAI
 * Covers symptoms, conditions, medications, coding, procedures, insurance, anatomy, etc.
 */
async function isMedicalQuery(messages) {
  const userMessage = messages?.find(msg => msg.role === 'user')?.content || '';

  const classificationPrompt = [
    {
      role: 'system',
      content: `You are a strict binary classifier. Determine if the user's message is related to any of the following medical topics: 
- Symptoms (e.g., fever, stomach pain)
- Diseases and conditions (e.g., diabetes, typhoid)
- Medications or drugs (e.g., paracetamol, antibiotics)
- Medical coding (e.g., ICD, CPT, billing codes)
- Diagnosis or treatment
- Healthcare services (e.g., consultation, OPD, emergency)
- Insurance and billing
- Clinical procedures (e.g., MRI, surgery)
- Body parts or human anatomy

Respond strictly with only "yes" or "no" — do not explain.`
    },
    {
      role: 'user',
      content: userMessage
    }
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: classificationPrompt,
      max_tokens: 1,
      temperature: 0,
    }),
  });

  const data = await response.json();
  const classification = data.choices?.[0]?.message?.content?.trim().toLowerCase();

  return classification === 'yes';
}

/**
 * ✅ Proxy endpoint for OpenAI API
 * Filters non-medical requests using the classifier before forwarding
 */
app.post('/api/chat', async (req, res) => {
  try {
    const {
      messages,
      model = 'gpt-4o-mini',
      max_tokens = 1000,
      temperature = 0.7,
    } = req.body;

    const allowed = await isMedicalQuery(messages);

    if (!allowed) {
      return res.json({
        choices: [{
          message: {
            role: 'assistant',
            content: "❌ Sorry, WellMed AI is strictly a medical coding and healthcare assistant. We can't respond to unrelated topics.",
          }
        }]
      });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens,
        temperature,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('OpenAI API Error:', data);
      return res.status(response.status).json({
        error: 'OpenAI API Error',
        details: data.error?.message || 'Unknown error',
      });
    }

    res.json(data);
  } catch (error) {
    console.error('Server Error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      details: error.message,
    });
  }
});

/**
 * ✅ Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Server is running',
    environment: process.env.NODE_ENV || 'development',
  });
});

// ✅ Start the server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 CORS allowed from: https://wellmade-ai.vercel.app`);
  console.log(`🔍 Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
