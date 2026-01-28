from flask import Flask, render_template

app = Flask(__name__)

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/<string:page_name>')
def html_page(page_name):
    # Ensure usage of .html extension
    if not page_name.endswith('.html'):
        page_name += '.html'
    try:
        return render_template(page_name)
    except Exception:
        return "Page not found", 404

if __name__ == "__main__":
    app.run()
