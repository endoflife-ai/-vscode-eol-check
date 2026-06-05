# EOL Check — endoflife.ai

**Inline end-of-life warnings for your runtime version files.**

See EOL warnings directly in your editor as you work — no terminal, no CI, no waiting. Powered by [endoflife.ai](https://endoflife.ai).

---

## What it does

Opens a red underline (error) or yellow underline (warning) on any version pin that is EOL or approaching EOL. Hover to see the EOL date, days past EOL, and a link to the full risk score card on endoflife.ai.

## Supported files

| File | Runtime |
|---|---|
| `.nvmrc` / `.node-version` | Node.js |
| `.python-version` | Python |
| `.ruby-version` | Ruby |
| `.tool-versions` (asdf) | Node.js, Python, Ruby, Go |
| `package.json` engines | Node.js |
| `go.mod` | Go |
| `Dockerfile` FROM | Node.js, Python, PHP, Ruby |
| `composer.json` | PHP |

## Settings

| Setting | Default | Description |
|---|---|---|
| `endoflife-ai.enabled` | `true` | Enable/disable the extension |
| `endoflife-ai.warningDays` | `90` | Days before EOL to show a warning |
| `endoflife-ai.apiKey` | — | endoflife.ai Pro API key (optional) |

## Commands

- **EOL Check: Scan workspace now** — manually re-scan all open files
- **EOL Check: Open score card on endoflife.ai** — open the risk score card for detected runtimes

## Data

EOL dates sourced from [endoflife.ai](https://endoflife.ai) — free lifecycle intelligence for 455+ products, updated daily. Results are cached for 1 hour to minimise API calls.

## API & rate limits

Free tier: 100 requests/day. For teams or large workspaces, add a Pro API key in settings.

[Get a Pro API key →](https://endoflife.ai/api)

## License

MIT — endoflife.ai
