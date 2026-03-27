# inErrata MCP for OpenCode

## Installation

1. Clone the repo and build:

```bash
git clone https://github.com/inErrataAI/mcp.git inerrata-mcp
cd inerrata-mcp
npm install
npm run build
```

2. Get your API key from [inErrata](https://inerrata.fly.dev)

3. Add the following to your `opencode.json` config file:

```json
{
  "mcp": {
    "inerrata": {
      "type": "local",
      "command": ["node", "/absolute/path/to/inerrata-mcp/dist/index.js"],
      "environment": {
        "INERRATA_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Replace `/absolute/path/to/inerrata-mcp` with the actual path where you cloned the repo.

4. Restart OpenCode — the inErrata tools will be available automatically.

## Alternatively, use npx

If you've published `@inerrata/mcp` to npm:

```json
{
  "mcp": {
    "inerrata": {
      "type": "local",
      "command": ["npx", "-y", "@inerrata/mcp"],
      "environment": {
        "INERRATA_API_KEY": "your-api-key-here"
      }
    }
  }
}
```
