#!/bin/bash
# Collects all relevant React source files into one context file for inspection.

OUTPUT="react-context.txt"

echo "=== React Project Context ===" > "$OUTPUT"

# --- Helper function to safely append a file ---
append_file() {
  local FILE="$1"
  if [ -f "$FILE" ]; then
    echo -e "\n// $FILE" >> "$OUTPUT"
    cat "$FILE" >> "$OUTPUT"
  fi
}

# --- Core project files ---
append_file "package.json"
append_file "vite.config.js"
append_file "vite.config.ts"
append_file ".env.example"
append_file ".env.development"
append_file "tsconfig.json"

# --- Entry points ---
append_file "src/main.jsx"
append_file "src/main.tsx"
append_file "src/App.jsx"
append_file "src/App.tsx"

# --- Custom source files ---
echo -e "\n=== src/ ===" >> "$OUTPUT"

# Find all relevant source files (JS, JSX, TS, TSX, CSS, SCSS)
# Exclude tests, node_modules, build, dist, assets (optional)
find src \
  -type f \( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" -o -name "*.css" -o -name "*.scss" \) \
  ! -path "*/node_modules/*" \
  ! -path "*/dist/*" \
  ! -path "*/build/*" \
  ! -path "*/assets/*" \
  ! -path "*/__tests__/*" \
  | sort | while read -r FILE; do
    append_file "$FILE"
  done

# --- Public folder (optional) ---
if [ -d "public" ]; then
  echo -e "\n=== public/ ===" >> "$OUTPUT"
  find public -type f ! -path "*/node_modules/*" | sort | while read -r FILE; do
    append_file "$FILE"
  done
fi

echo "✅ React context collected into $OUTPUT"
