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
 * AI-powered image relevance check using Sarvam-30B
 * Since Sarvam doesn't support direct image input in chat, we analyze the image metadata
 * and use heuristic + AI description matching
 * Returns { isRelevant: boolean, confidence: number, reason: string }
 */
export async function validateImageRelevance(issueType, imageBase64) {
    try {
        // 1. Basic image validation
        if (!imageBase64 || !imageBase64.startsWith('data:image')) {
            return { isRelevant: false, confidence: 1.0, reason: 'No valid image provided' };
        }

        // 2. Check image size (too small = likely placeholder/icon)
        const sizeKB = Math.round((imageBase64.length * 3) / 4 / 1024);
        if (sizeKB < 5) {
            return { isRelevant: false, confidence: 0.8, reason: 'Image is too small — likely not a real photo' };
        }

        // 3. Analyze image properties via canvas
        const imageAnalysis = await analyzeImageProperties(imageBase64);

        // 4. AI analysis of image characteristics
        const apiKey = _getApiKey();
        if (!apiKey) {
            return { isRelevant: true, confidence: 0, reason: 'Cannot verify — no API key' };
        }

        const prompt = `You are an image relevance checker for a civic complaint app called Setu. A user reported an issue of type "${issueType}".

IMAGE ANALYSIS DATA:
- Image dimensions: ${imageAnalysis.width}x${imageAnalysis.height}
- Dominant colors: ${imageAnalysis.dominantColors}
- Brightness level: ${imageAnalysis.brightness}
- Is mostly single color: ${imageAnalysis.isSolidColor}
- Has face-like features (high skin-tone ratio): ${imageAnalysis.hasSkinTones}
- Image complexity (edge density): ${imageAnalysis.complexity}

Based on this analysis, determine if this image is LIKELY a genuine photo of a "${issueType}" issue, or if it's likely FAKE/IRRELEVANT (e.g., selfie, screenshot, solid color, random image, meme).

Respond ONLY with JSON (no markdown):
{"isRelevant": true/false, "confidence": 0.0-1.0, "reason": "brief explanation"}`;

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
            return { isRelevant: true, confidence: 0, reason: 'Image validation unavailable' };
        }

        const data = await response.json();
        let content = data.choices?.[0]?.message?.content || '';
        content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        content = content.replace(/<think>[\s\S]*/gi, '').trim();

        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const result = JSON.parse(jsonMatch[0]);
                return {
                    isRelevant: !!result.isRelevant,
                    confidence: parseFloat(result.confidence) || 0,
                    reason: result.reason || 'No reason provided'
                };
            }
        } catch (parseErr) {
            console.warn('[report-validator] Failed to parse image AI response');
        }

        return { isRelevant: true, confidence: 0, reason: 'Could not determine' };

    } catch (error) {
        console.error('[report-validator] Image validation error:', error);
        return { isRelevant: true, confidence: 0, reason: 'Validation error' };
    }
}

/**
 * Analyze image properties from base64 using Canvas API
 * Extracts: dominant colors, brightness, skin tone ratio, edge density, dimensions
 */
function analyzeImageProperties(imageBase64) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Use smaller size for performance
            const maxSize = 100;
            const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);

            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const pixels = imageData.data;

            let totalR = 0, totalG = 0, totalB = 0;
            let skinPixels = 0;
            let colorBuckets = {};
            const totalPixels = canvas.width * canvas.height;

            for (let i = 0; i < pixels.length; i += 4) {
                const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];

                totalR += r; totalG += g; totalB += b;

                // Skin tone detection (simplified RGB range)
                if (r > 95 && g > 40 && b > 20 &&
                    r > g && r > b &&
                    (r - g) > 15 && (r - b) > 15 &&
                    Math.abs(r - g) < 100) {
                    skinPixels++;
                }

                // Color bucketing (reduce to 4-bit per channel)
                const bucket = `${Math.floor(r / 64)},${Math.floor(g / 64)},${Math.floor(b / 64)}`;
                colorBuckets[bucket] = (colorBuckets[bucket] || 0) + 1;
            }

            const avgR = Math.round(totalR / totalPixels);
            const avgG = Math.round(totalG / totalPixels);
            const avgB = Math.round(totalB / totalPixels);
            const brightness = Math.round((avgR * 0.299 + avgG * 0.587 + avgB * 0.114));

            // Determine dominant colors
            const sortedBuckets = Object.entries(colorBuckets).sort((a, b) => b[1] - a[1]);
            const topColors = sortedBuckets.slice(0, 3).map(([color, count]) => {
                const [r, g, b] = color.split(',').map(Number);
                const pct = Math.round((count / totalPixels) * 100);
                return `rgb(${r * 64},${g * 64},${b * 64}) ${pct}%`;
            });

            // Check if mostly solid color
            const topColorPct = sortedBuckets[0] ? (sortedBuckets[0][1] / totalPixels) : 0;
            const isSolidColor = topColorPct > 0.7;

            // Edge detection (simple Sobel-like)
            let edgeCount = 0;
            for (let y = 1; y < canvas.height - 1; y++) {
                for (let x = 1; x < canvas.width - 1; x++) {
                    const idx = (y * canvas.width + x) * 4;
                    const idxRight = idx + 4;
                    const idxDown = idx + canvas.width * 4;

                    const gx = Math.abs(pixels[idx] - pixels[idxRight]);
                    const gy = Math.abs(pixels[idx] - pixels[idxDown]);
                    if (gx + gy > 30) edgeCount++;
                }
            }
            const complexity = Math.round((edgeCount / totalPixels) * 100);

            const skinRatio = Math.round((skinPixels / totalPixels) * 100);

            resolve({
                width: img.width,
                height: img.height,
                dominantColors: topColors.join(', '),
                brightness: brightness < 50 ? 'very dark' : brightness < 100 ? 'dark' : brightness < 160 ? 'medium' : brightness < 210 ? 'bright' : 'very bright',
                isSolidColor: isSolidColor,
                hasSkinTones: skinRatio > 30,
                complexity: complexity < 10 ? 'very low (likely solid/gradient)' : complexity < 25 ? 'low' : complexity < 50 ? 'medium' : 'high (detailed photo)'
            });
        };

        img.onerror = () => {
            resolve({
                width: 0, height: 0, dominantColors: 'unknown',
                brightness: 'unknown', isSolidColor: false,
                hasSkinTones: false, complexity: 'unknown'
            });
        };

        img.src = imageBase64;
    });
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
