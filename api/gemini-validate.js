// api/gemini-validate.js
// Vercel serverless function to securely run Gemini image validation without exposing key on client

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { issueType, imageBase64 } = req.body;
        if (!imageBase64 || !imageBase64.startsWith('data:image')) {
            return res.status(400).json({ error: 'No valid image provided' });
        }

        const mimeType = imageBase64.split(';')[0].split(':')[1];
        const base64Data = imageBase64.split(',')[1];

        // Retrieve GEMINI_API_KEY from environment variables (fallback to hardcoded if not set yet)
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyBf9iL64B2i7J9NQYHzHISajMItQ_QLVlA";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

        const prompt = `You are the lead vision moderator for 'Setu', a civic issue reporting app. A user reported an issue categorized as: "${issueType}".
        
Look carefully at the provided image. Does this image genuinely look like a photo of a "${issueType}"?
Identify if this is SPAM or FAKE. Red flags for spam:
- It's a selfie or heavily focuses on a person's face.
- It's a random screenshot of a phone screen or text.
- It's a meme, a cartoon, or heavily digitally altered.
- It shows an indoor setting (like a bedroom) when the issue is clearly outdoor ("Broken Roads").
- It is completely pitch black or a solid color.

Reply ONLY with a raw JSON object (absolutely no markdown, no \`\`\`json block, no extra text):
{"isRelevant": true, "confidence": 0.9, "reason": "brief explanation"}`;

        const payload = {
            contents: [{
                parts: [
                    { text: prompt },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Data
                        }
                    }
                ]
            }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 150,
                responseMimeType: "application/json"
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({ error: errorText });
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        try {
            const result = JSON.parse(content);
            return res.status(200).json(result);
        } catch (parseErr) {
            return res.status(200).json({ isRelevant: true, confidence: 0, reason: 'Could not parse response: ' + content });
        }
    } catch (error) {
        console.error('[gemini-validate]', error);
        return res.status(500).json({ error: error.message });
    }
};
