import os

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
    # Also handle url() in style tags if any (less likely to be inline, but possible)
    ('url(images/', 'url(../static/images/'),
    ('url("images/', 'url("../static/images/'),
    ("url('images/", "url('../static/images/")
]

for filename in os.listdir(templates_dir):
    if filename.endswith(".html"):
        filepath = os.path.join(templates_dir, filename)
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        new_content = content
        for old, new in replacements:
            new_content = new_content.replace(old, new)
        
        if new_content != content:
            print(f"Updating {filename}...")
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
        else:
            print(f"No changes for {filename}")
