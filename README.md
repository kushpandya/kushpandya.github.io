# Kush Pandya — Signal Path

Personal portfolio site of **Kush Pandya**, AI Engineer based in Mumbai.

**Live site:** https://kushpandya.github.io

## About

This is a static site hosted for free on **GitHub Pages**.

## On-site chatbot (Signal Chat)

The site ships a small client-side chatbot that answers questions about Kush using markdown files as its knowledge base — no server, no API key, everything runs in the visitor's browser.

- `context/*.md` — the knowledge base (about, journey, projects, skills, contact). Edit these files to change what the bot knows.
- `chatbot/chatbot.js` — fetches the markdown files, splits them into sections, and retrieves the best-matching section with BM25 ranking (heading matches weigh double; answers cite their source file).
- `chatbot/chatbot.css` — floating widget styles, matched to the site's theme.

To extend the bot's knowledge, add a markdown file to `context/` and register it in the `KNOWLEDGE_BASE` list at the top of `chatbot/chatbot.js`.

## Tech

- Pure HTML + CSS + vanilla JS
- No build step required
