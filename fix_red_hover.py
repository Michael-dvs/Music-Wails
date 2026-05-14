import os
import re

dir_path = r'frontend/src'

def process_file(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    original = content
    
    # We want to replace hover text going to black/white to hover text going to brand red (text-brand-500)
    # The user specifically mentioned QueuePanel having black hover text that is annoying, and wants ALL hovers to be red.
    
    # Text changes
    content = content.replace('hover:text-black dark:hover:text-white', 'hover:text-brand-500 dark:hover:text-brand-400')
    content = content.replace('group-hover:text-black dark:hover:text-white', 'group-hover:text-brand-500 dark:group-hover:text-brand-400')
    content = content.replace('group-hover:text-black dark:group-hover:text-white', 'group-hover:text-brand-500 dark:group-hover:text-brand-400')
    
    if new_content := content:
        if new_content != original:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(new_content)
            print(f"Updated {filepath}")

for root, _, files in os.walk(dir_path):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            process_file(os.path.join(root, file))

print('Done.')
