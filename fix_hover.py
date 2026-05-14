import os
import re

dir_path = r'frontend/src'

def process_file(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    original = content
    
    # Fix hover/group-hover text colors
    content = content.replace('hover:text-black dark:text-white', 'hover:text-black dark:hover:text-white')
    content = content.replace('group-hover:text-black dark:text-white', 'group-hover:text-black dark:group-hover:text-white')
    
    # Fix hover/group-hover backgrounds
    content = re.sub(r'hover:bg-black/(\d+)\s+dark:bg-white/\1', r'hover:bg-black/\1 dark:hover:bg-white/\1', content)
    content = re.sub(r'group-hover:bg-black/(\d+)\s+dark:bg-white/\1', r'group-hover:bg-black/\1 dark:group-hover:bg-white/\1', content)
    content = re.sub(r'hover:bg-white/(\d+)\s+dark:bg-black/\1', r'hover:bg-white/\1 dark:hover:bg-black/\1', content)
    content = re.sub(r'group-hover:bg-white/(\d+)\s+dark:bg-black/\1', r'group-hover:bg-white/\1 dark:group-hover:bg-black/\1', content)
    
    # Fix opacity text
    content = re.sub(r'\btext-black\s+dark:text-white/(\d+)', r'text-black/\1 dark:text-white/\1', content)

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
