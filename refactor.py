import os
import re

dir_path = r'frontend/src'

replacements = {
    r'\btext-white\b': 'text-black dark:text-white',
    r'\btext-gray-400\b': 'text-gray-600 dark:text-gray-400',
    r'\btext-gray-500\b': 'text-gray-500 dark:text-gray-500', 
    r'\btext-gray-300\b': 'text-gray-700 dark:text-gray-300',
    r'\btext-gray-200\b': 'text-gray-800 dark:text-gray-200',
    r'\bbg-black\b': 'bg-white dark:bg-black',
    r'\bbg-black/([0-9]+)\b': r'bg-white/\1 dark:bg-black/\1',
    r'\bbg-white/([0-9]+)\b': lambda m: f'bg-black/{int(m.group(1))} dark:bg-white/{m.group(1)}',
    r'\bborder-white/([0-9]+)\b': lambda m: f'border-black/{int(m.group(1))} dark:border-white/{m.group(1)}',
    r'\bborder-white\b': 'border-black dark:border-white',
    r'\bshadow-white/([0-9]+)\b': lambda m: f'shadow-black/{int(m.group(1))} dark:shadow-white/{m.group(1)}',
    r'\bfill-white\b': 'fill-black dark:fill-white',
    r'\bfill-black\b': 'fill-white dark:fill-black',
    r'\btext-black\b': 'text-white dark:text-black',
}

# Fix overlapping problems by applying in careful order or using a callback
# We should avoid replacing text-black if it was just replaced.
# A single pass regex substitution is best.

def replacer(match):
    val = match.group(0)
    
    if val == 'text-white': return 'text-black dark:text-white'
    if val == 'text-black': return 'text-white dark:text-black'
    
    if val == 'text-gray-400': return 'text-gray-600 dark:text-gray-400'
    if val == 'text-gray-300': return 'text-gray-700 dark:text-gray-300'
    if val == 'text-gray-200': return 'text-gray-800 dark:text-gray-200'
    
    if val == 'bg-black': return 'bg-white dark:bg-black'
    
    if val.startswith('bg-black/'):
        n = val.split('/')[1]
        return f'bg-white/{n} dark:bg-black/{n}'
        
    if val.startswith('bg-white/'):
        n = val.split('/')[1]
        return f'bg-black/{n} dark:bg-white/{n}'
        
    if val.startswith('border-white/'):
        n = val.split('/')[1]
        return f'border-black/{n} dark:border-white/{n}'
        
    if val == 'border-white': return 'border-black dark:border-white'
    
    if val.startswith('shadow-white/'):
        n = val.split('/')[1]
        return f'shadow-black/{n} dark:shadow-white/{n}'
        
    if val == 'fill-white': return 'fill-black dark:fill-white'
    if val == 'fill-black': return 'fill-white dark:fill-black'

    return val

# pattern to match all
pattern = re.compile(r'\b(text-white|text-black|text-gray-400|text-gray-300|text-gray-200|bg-black(?:/\d+)?|bg-white(?:/\d+)?|border-white(?:/\d+)?|shadow-white(?:/\d+)?|fill-white|fill-black)\b')

def process_file(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Quick check if it already contains "dark:text-white" to prevent double replacement
    if "dark:text-white" in content or "dark:bg-black" in content:
        return

    new_content = pattern.sub(replacer, content)
    
    if new_content != content:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Updated {filepath}")

for root, _, files in os.walk(dir_path):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            process_file(os.path.join(root, file))

print('Done.')
