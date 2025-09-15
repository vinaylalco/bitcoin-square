# collect-react.sh
#!/bin/bash

OUTPUT="react-context.txt"

# Start fresh
echo "=== React Project Context ===" > $OUTPUT

# Add package.json
{
  echo ""
  echo "// package.json"
  cat package.json
} >> $OUTPUT

# Add vite config
if [ -f vite.config.js ]; then
  {
    echo ""
    echo "// vite.config.js"
    cat vite.config.js
  } >> $OUTPUT
fi

# Add entrypoint
if [ -f src/main.jsx ]; then
  {
    echo ""
    echo "// src/main.jsx"
    cat src/main.jsx
  } >> $OUTPUT
fi

# Add App shell
if [ -f src/App.jsx ]; then
  {
    echo ""
    echo "// src/App.jsx"
    cat src/App.jsx
  } >> $OUTPUT
fi

# Add env example
if [ -f .env.example ]; then
  {
    echo ""
    echo "// .env.example"
    cat .env.example
  } >> $OUTPUT
fi

echo "✅ React context collected into $OUTPUT"
