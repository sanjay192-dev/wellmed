
const express = require('express');    
const cors = require('cors');    
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));    
require('dotenv').config();    
    
const app = express();    
const PORT = process.env.PORT || 5000;    
    
// ✅ CORS: allow frontend hosted on Vercel    
const allowedOrigins = [    
  'https://www.wellmedai.com',    
  'http://localhost:5173'    
];    
    
app.use(cors({    
  origin: function (origin, callback) {    
    // Allow requests with no origin (e.g. curl or mobile apps)    
    if (!origin || allowedOrigins.includes(origin)) {    
      callback(null, true);    
    } else {    
      callback(new Error('Not allowed by CORS'));    
    }    
  },    
  credentials: true    
}));    
    
app.use(express.json());    
    
/**    
 * ✅ Classifies if the message is medical-related using OpenAI    
 * Covers symptoms, conditions, medications, coding, procedures, insurance, anatomy, etc.    
 */    
async function isMedicalQuery(messages) {
  const userMessage = messages?.findLast(msg => msg.role === 'user')?.content || '';
  const lastAssistantMessage = messages?.findLast(msg => msg.role === 'assistant')?.content || '';

  const classificationPrompt = [
    {
      role: 'system',
      content: `You are a strict binary classifier.

Determine if the user's message is related to **medical topics** — including:

Symptoms (e.g., fever, stomach pain, dizziness, fatigue, "not feeling well", "feeling sick")

Diseases and conditions (e.g., diabetes, typhoid, asthma, cancer, infections, chronic illness)

Medications or drugs (e.g., paracetamol, antibiotics, insulin, dosage, side effects, drug interactions)

Medical coding (e.g., ICD, CPT, HCPCS, billing codes, modifiers, diagnosis codes)

Diagnosis or treatment (e.g., test results, prescriptions, therapies, interpretation of lab reports)

Healthcare services (e.g., consultation, OPD, emergency, telemedicine, appointments, hospital logistics)

Insurance and billing (e.g., medical claims, reimbursements, coverage questions, preauthorization)

Clinical procedures (e.g., MRI, surgery, X-ray, CT scan, biopsy, endoscopy)

Body parts or human anatomy (e.g., heart, lungs, spine, liver, joints, nerves)

Mental health (e.g., anxiety, depression, counseling, psychiatric care)

Medical devices or equipment (e.g., pacemaker, glucometer, thermometer, wheelchair)

Health vitals or measurements (e.g., blood pressure, oxygen saturation, glucose levels, heart rate)

The user message may also be a **follow-up to a previous assistant message**, like "how long does it last?", "can it be treated?", etc.

Evaluate the user’s message **in the context of the last assistant reply**. If it is a valid **medical message** or **follow-up to a medical reply**, respond with **yes**. Otherwise, respond with **no**.

Respond strictly with only one word: **"yes"** or **"no"** — no punctuation or explanation.
`
    },
    {
      role: 'user',
      content: `Previous reply: ${lastAssistantMessage}\nUser message: ${userMessage}`
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
    
