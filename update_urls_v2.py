import os
import sys

templates_dir = r"d:\project-sih31\templates"

replacements = [
    ('href="css/', 'href="../static/css/'),
    ('src="js/', 'src="../static/js/'),
    ('src="images/', 'src="../static/images/'),
    ('href="images/', 'href="../static/images/'),
    ("href='css/", "href='../static/css/"),
    ("src='js/", "src='../static/js/"),
    ("src='images/", "src='../static/images/"),
    ("href='images/", "href='../static/images/"),
    ('url(images/', 'url(../static/images/'),
    ('url("images/', 'url("../static/images/'),
    ("url('images/", "url('../static/images/")
]

print(f"Starting update in {templates_dir}", flush=True)

try:
    if not os.path.exists(templates_dir):
        print(f"Error: Directory {templates_dir} does not exist", flush=True)
        sys.exit(1)

    for filename in os.listdir(templates_dir):
        if filename.endswith(".html"):
            filepath = os.path.join(templates_dir, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                new_content = content
                for old, new in replacements:
                    new_content = new_content.replace(old, new)
                
                if new_content != content:
                    print(f"Updating {filename}...", flush=True)
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                else:
                    print(f"No changes for {filename}", flush=True)
            except Exception as e:
                print(f"Error processing {filename}: {e}", flush=True)

    print("DONE", flush=True)

except Exception as e:
    print(f"Global error: {e}", flush=True)
