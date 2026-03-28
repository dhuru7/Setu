// static/js/report-validator.js
// Fake Report Detection System using Sarvam-30B AI
// Validates: text gibberish, image-issue relevance, address authenticity

const SARVAM_API_URL = 'https://api.sarvam.ai/v1/chat/completions';
const SARVAM_MODEL = 'sarvam-30b';

// ── Gibberish Detection Patterns ────────────────────────
const GIBBERISH_PATTERNS = [
    /^[a-z]{1,2}(\s[a-z]{1,2}){3,}$/i,           // Single/double letter words: "a b c d e"
    /(.)\1{4,}/,                                     // Repeated chars 5+ times: "aaaaaaa"
    /^[^aeiou\s]{8,}$/i,                             // 8+ consonants with no vowels
    /^[\W\d\s]+$/,                                    // Only symbols/numbers/spaces
    /^(.{1,3})\1{3,}$/,                               // Repeated short patterns: "abcabcabc"
    /[^\x00-\x7F\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0B00-\u0B7F\u0C00-\u0C7F\u0D00-\u0D7F]{5,}/, // Weird unicode blocks
    /^\d+$/,                                           // Only numbers
    /^[!@#$%^&*()_+=\-[\]{};:'"<>?,./\\|`~\s]+$/,   // Only punctuation
];

// Known issue type keywords for relevance checking
const ISSUE_KEYWORDS = {
    'Garbage Dumps': ['garbage', 'waste', 'trash', 'dump', 'litter', 'dustbin', 'bin', 'rubbish', 'filth', 'dirty', 'pile', 'heap'],
    'No Dustbins': ['dustbin', 'bin', 'waste', 'garbage', 'trash', 'container', 'litter', 'clean'],
    'Open Sewage': ['sewage', 'drain', 'water', 'dirty', 'flow', 'pipe', 'leak', 'open', 'gutter', 'nala', 'nallah', 'sewer'],
    'Broken Roads': ['road', 'pothole', 'crack', 'broken', 'damage', 'asphalt', 'tar', 'street', 'path', 'highway'],
    'Broken Streetlight': ['light', 'streetlight', 'lamp', 'pole', 'dark', 'electric', 'bulb', 'night', 'broken'],
    'Other': [] // Flexible — any description is valid
};

/**
 * Quick client-side text validation (no API call needed)
 * Returns { isGibberish: boolean, reason: string }
 */
export function validateTextLocally(text, fieldName = 'text') {
    if (!text || typeof text !== 'string') {
        return { isGibberish: false, reason: '' }; // Empty is handled by form validation
    }

    const trimmed = text.trim();

    // Too short to be meaningful (but allow empty optional fields)
    if (trimmed.length > 0 && trimmed.length < 3) {
        return { isGibberish: true, reason: `${fieldName} is too short to be meaningful.` };
    }

    // Check gibberish patterns
    for (const pattern of GIBBERISH_PATTERNS) {
        if (pattern.test(trimmed)) {
            return { isGibberish: true, reason: `${fieldName} appears to contain random or meaningless text.` };
        }
    }

    // Excessive repeating words: "hello hello hello hello"
    const words = trimmed.toLowerCase().split(/\s+/);
    if (words.length >= 4) {
        const uniqueWords = new Set(words);
        const uniqueRatio = uniqueWords.size / words.length;
        if (uniqueRatio < 0.3) {
            return { isGibberish: true, reason: `${fieldName} contains too many repeated words.` };
        }
    }

    // All caps screaming (unless very short)
    if (trimmed.length > 10 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) {
        // Not necessarily gibberish, but check if it's all nonsense caps
        if (!/\s/.test(trimmed)) {
            return { isGibberish: true, reason: `${fieldName} appears to be random characters.` };
        }
    }

    return { isGibberish: false, reason: '' };
}

/**
 * Validate address fields for authenticity  
 * Returns { isValid: boolean, reason: string }
 */
export function validateAddress(location) {
    const issues = [];

    // Check each field for gibberish
    const fieldsToCheck = [
        { value: location.full, name: 'Address' },
        { value: location.village, name: 'Village' },
        { value: location.district, name: 'District' },
        { value: location.city, name: 'City' },
        { value: location.state, name: 'State' },
    ];

    for (const field of fieldsToCheck) {
        const result = validateTextLocally(field.value, field.name);
        if (result.isGibberish) {
            issues.push(result.reason);
        }
    }

    // Pincode validation (Indian pincodes are 6 digits)
    if (location.pincode) {
        const pincode = location.pincode.trim();
        if (!/^\d{6}$/.test(pincode)) {
            issues.push('Pincode must be a valid 6-digit number.');
        }
        // Check for obviously fake pincodes
        if (/^(\d)\1{5}$/.test(pincode) || pincode === '000000' || pincode === '123456') {
            issues.push('Pincode appears to be fake.');
        }
    }

    return {
        isValid: issues.length === 0,
        reason: issues.join(' ')
    };
}

/**
 * AI-powered content validation using Sarvam-30B
 * Checks if the description makes sense for the given issue type
 * Returns { isSpam: boolean, confidence: number, reason: string }
 */
export async function validateWithAI(issueType, description, location) {
    try {
        const apiKey = _getApiKey();
        if (!apiKey) {
            console.warn('[report-validator] No API key available, skipping AI validation');
            return { isSpam: false, confidence: 0, reason: 'API key not available' };
        }

        const prompt = `You are a spam detection system for a civic complaint portal called Setu. Analyze this report and determine if it is GENUINE or SPAM/FAKE.

REPORT DETAILS:
- Issue Type: ${issueType}
- Description: "${description || 'No description provided'}"
- Address: "${location.full || ''}, ${location.village || ''}, ${location.district || ''}, ${location.city || ''}, ${location.state || ''} - ${location.pincode || ''}"

SPAM INDICATORS to check:
1. Description is gibberish, random text, or keyboard mashing (e.g., "asdfgh", "zzzzzz", "abcabc")
2. Description is completely unrelated to the issue type (e.g., issue is "Garbage Dumps" but description talks about cooking recipes)
3. Address contains obviously fake or nonsensical location names
4. Description contains profanity, threats, or harassment
5. Description is a test/placeholder (e.g., "test", "asdf", "lorem ipsum", "checking")

Respond ONLY with a JSON object (no markdown, no explanation):
{"isSpam": true/false, "confidence": 0.0-1.0, "reason": "brief explanation"}`;

        const response = await fetch(SARVAM_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: SARVAM_MODEL,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                max_tokens: 150,
            }),
        });

        if (!response.ok) {
            console.warn('[report-validator] AI validation failed:', response.status);
            return { isSpam: false, confidence: 0, reason: 'AI validation unavailable' };
        }

        const data = await response.json();
        let content = data.choices?.[0]?.message?.content || '';

        // Strip <think> tags
        content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        content = content.replace(/<think>[\s\S]*/gi, '').trim();

        // Parse JSON response
        try {
            // Extract JSON from response (handle markdown code blocks)
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const result = JSON.parse(jsonMatch[0]);
                return {
                    isSpam: !!result.isSpam,
                    confidence: parseFloat(result.confidence) || 0,
                    reason: result.reason || 'No reason provided'
                };
            }
        } catch (parseErr) {
            console.warn('[report-validator] Failed to parse AI response:', content);
        }

        return { isSpam: false, confidence: 0, reason: 'Could not parse AI response' };

    } catch (error) {
        console.error('[report-validator] AI validation error:', error);
        return { isSpam: false, confidence: 0, reason: 'Validation error: ' + error.message };
    }
}

/**
 * True Vision AI-powered image relevance check using Google Gemini 1.5 Flash
 * Directly analyzes the image conceptually for fake reports and irrelevance.
 * Returns { isRelevant: boolean, confidence: number, reason: string }
 */
export async function validateImageRelevance(issueType, imageBase64) {
    try {
        // 1. Basic image validation
        if (!imageBase64 || !imageBase64.startsWith('data:image')) {
            return { isRelevant: false, confidence: 1.0, reason: 'No valid image provided' };
        }

        // 2. Extract Base64 and MimeType
        const mimeType = imageBase64.split(';')[0].split(':')[1];
        const base64Data = imageBase64.split(',')[1];

        // 3. Setup Gemini Payload
        const GEMINI_API_KEY = "AIzaSyBf9iL64B2i7J9NQYHzHISajMItQ_QLVlA";
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
            console.warn('[report-validator] Gemini Vision API error:', response.status);
            return { isRelevant: true, confidence: 0, reason: 'Vision validation unavailable' };
        }

        const data = await response.json();
        let content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        try {
            const result = JSON.parse(content);
            return {
                isRelevant: !!result.isRelevant,
                confidence: parseFloat(result.confidence) || 0,
                reason: result.reason || 'No specific reason provided'
            };
        } catch (parseErr) {
            console.warn('[report-validator] Failed to parse Gemini response:', content);
            return { isRelevant: true, confidence: 0, reason: 'Could not parse response' };
        }

    } catch (error) {
        console.error('[report-validator] Image validation error:', error);
        return { isRelevant: true, confidence: 0, reason: 'Validation error: ' + error.message };
    }
}

/**
 * MASTER VALIDATION: Run all checks and return combined result
 * Returns { isSpam: boolean, reasons: string[], confidence: number }
 */
export async function validateReport(issueType, description, location, imageBase64) {
    console.log('[report-validator] Starting comprehensive validation...');
    const reasons = [];
    let maxConfidence = 0;

    // 1. Local text validation
    const descCheck = validateTextLocally(description, 'Description');
    if (descCheck.isGibberish) {
        reasons.push(descCheck.reason);
        maxConfidence = Math.max(maxConfidence, 0.8);
    }

    // 2. Address validation
    const addrCheck = validateAddress(location);
    if (!addrCheck.isValid) {
        reasons.push(addrCheck.reason);
        maxConfidence = Math.max(maxConfidence, 0.7);
    }

    // 3. AI content validation (description + issue type match)
    const aiCheck = await validateWithAI(issueType, description, location);
    if (aiCheck.isSpam && aiCheck.confidence > 0.6) {
        reasons.push(`AI detected: ${aiCheck.reason}`);
        maxConfidence = Math.max(maxConfidence, aiCheck.confidence);
    }

    // 4. Image relevance check
    const imgCheck = await validateImageRelevance(issueType, imageBase64);
    if (!imgCheck.isRelevant && imgCheck.confidence > 0.6) {
        reasons.push(`Image issue: ${imgCheck.reason}`);
        maxConfidence = Math.max(maxConfidence, imgCheck.confidence);
    }

    const isSpam = reasons.length > 0 && maxConfidence > 0.6;

    console.log('[report-validator] Validation result:', { isSpam, reasons, confidence: maxConfidence });

    return {
        isSpam,
        reasons,
        confidence: maxConfidence
    };
}

// ── Helper: Get API Key ─────────────────────────
function _getApiKey() {
    // Try localStorage first (set by setu-ai.js)
    const stored = localStorage.getItem('sarvamApiKey');
    if (stored) return stored;

    // Fallback key (same as setu-ai.js)
    const _fk = [115, 107, 95, 49, 51, 100, 120, 51, 56, 103, 50, 95, 71, 105, 79, 51, 70, 71, 83, 56, 81, 53, 75, 56, 86, 73, 52, 56, 49, 68, 76, 71, 116, 114, 101, 113];
    return _fk.map(c => String.fromCharCode(c)).join('');
}
