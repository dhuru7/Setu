from flask import Flask, render_template, request, jsonify
import requests
import json

app = Flask(__name__)

# Config
GEMINI_API_KEY = "AIzaSyCpL97jDcmEStMOPJ6gTHdT93ScKugdvzQ"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/<string:page_name>')
def html_page(page_name):
    if not page_name.endswith('.html'):
        page_name += '.html'
    try:
        return render_template(page_name)
    except Exception:
        return "Page not found", 404

@app.route('/ask-ai', methods=['POST'])
def ask_ai():
    try:
        user_query = request.json.get('query', '')
        if not user_query:
            return jsonify({'error': 'No query provided'}), 400

        # Construct Gemini Payload
        payload = {
            "contents": [{
                "parts": [{"text": f"You are Setu AI, a helpful civic assistant. Answer efficiently. Query: {user_query}"}]
            }]
        }

        # Server-side HTTP Request (No CORS issues)
        response = requests.post(GEMINI_URL, json=payload, headers={'Content-Type': 'application/json'})
        
        if response.status_code != 200:
            return jsonify({'error': f"Gemini API Error: {response.text}"}), 500

        data = response.json()
        ai_text = data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', 'No response.')
        
        return jsonify({'response': ai_text})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)

