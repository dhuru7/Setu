// api/sarvam.js
// Vercel serverless function to securely call Sarvam AI without exposing key on client

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
        // Retrieve SARVAM_API_KEY from environment variables (fallback to hardcoded if not set yet)
        const SARVAM_API_KEY = process.env.SARVAM_API_KEY || "sk_13dx38g2_GiO3FGS8Q5K8VI481DLGtreq";
        const SARVAM_API_URL = 'https://api.sarvam.ai/v1/chat/completions';

        const response = await fetch(SARVAM_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-subscription-key': SARVAM_API_KEY,
                'Authorization': `Bearer ${SARVAM_API_KEY}`
            },
            body: JSON.stringify(req.body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({ error: errorText });
        }

        const data = await response.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error('[sarvam-api]', error);
        return res.status(500).json({ error: error.message });
    }
};
