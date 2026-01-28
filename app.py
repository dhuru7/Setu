from flask import Flask, request, jsonify
from flask_cors import CORS
from sarvamai import SarvamAI

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Initialize Sarvam AI client with new API key
client = SarvamAI(api_subscription_key="sk_41b4repc_2IRSgt6yVmBW0cdQV4yPKyyc")

# System prompt for Setu AI assistant
SYSTEM_PROMPT = """You are Setu AI, a helpful assistant for the Setu civic issue reporting platform. 
You help citizens with:
- Reporting civic issues (potholes, garbage, streetlights, water supply, etc.)
- Understanding the status of their reports
- Navigating the platform
- Answering questions about civic services

Be helpful, concise, and friendly. If asked about something unrelated to civic issues or the platform, 
politely redirect the conversation back to how you can help with civic matters."""

@app.route('/ask-ai', methods=['POST'])
def ask_ai():
    """Handle AI chat requests from the frontend."""
    try:
        data = request.get_json()
        
        if not data or 'query' not in data:
            return jsonify({'error': 'No query provided'}), 400
        
        user_query = data['query'].strip()
        
        if not user_query:
            return jsonify({'error': 'Empty query'}), 400
        
        # Call Sarvam AI API
        response = client.chat.completions(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_query}
            ]
        )
        
        # Extract the response text
        if hasattr(response, 'choices') and len(response.choices) > 0:
            ai_response = response.choices[0].message.content
        elif isinstance(response, dict) and 'choices' in response:
            ai_response = response['choices'][0]['message']['content']
        else:
            # Fallback: try to get response directly
            ai_response = str(response)
        
        return jsonify({'response': ai_response})
    
    except Exception as e:
        print(f"Error in /ask-ai: {e}")
        return jsonify({'error': f'AI service error: {str(e)}'}), 500


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({'status': 'ok', 'service': 'Setu AI Backend'})


if __name__ == '__main__':
    print("==> Starting Setu AI Server on http://localhost:5000")
    print("==> AI Endpoint: http://localhost:5000/ask-ai")
    print("==> Health Check: http://localhost:5000/health")
    app.run(host='0.0.0.0', port=5000, debug=True)
