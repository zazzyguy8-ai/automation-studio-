# AI Execution Vault

Static single-page product (HTML + CSS + vanilla JS, no build step) sold on Whop
for $24.99 with a 50% affiliate split.

| File         | What it holds                                                       |
|--------------|---------------------------------------------------------------------|
| `index.html` | Page shell: hero, Vault / Workflows / ROI tabs, pricing             |
| `styles.css` | Dark Linear-style theme (`#09090b`, 1px borders, Inter)             |
| `data.js`    | All content: 154 tools & prompts, 5 workflows, categories           |
| `app.js`     | Search, filters, copy-to-clipboard, workflows, ROI calc, checkout   |

## Before selling

1. Set `CONFIG.checkoutUrl` at the top of `app.js` to the real Whop checkout
   link. `publish.sh` warns while the `REPLACE_ME` placeholder is still there.
2. Partner links: send creators to the page with `?a=<their-whop-username>`.
   The page appends that `a` param to every checkout button (and remembers it
   in the visitor's browser), which is how Whop attributes the affiliate sale.

## Editing content

Add entries in `data.js` with `T(...)` for a tool or `P(...)` for a prompt.
Text in `[BRACKETS]` or `{{double_braces}}` inside a prompt is highlighted as a
fill-in field. Counts on the page update automatically.

## Publishing

```bash
./publish.sh ai-vault   # syntax-checks the JS, then copies to docs/ai-vault/
```

Everything under `docs/ai-vault/` is public once GitHub Pages serves it, including
the full content in `data.js`. Deliver the paid copy through a Whop-gated link.
