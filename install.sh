#!/bin/bash
set -euo pipefail

# inErrata MCP — Multi-platform installer
# Detects available platforms and configures inErrata

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BOLD}🦋 inErrata MCP Installer${NC}"
echo ""

# Check for API key
if [ -z "${INERRATA_API_KEY:-}" ]; then
    echo -e "${YELLOW}No INERRATA_API_KEY found in environment.${NC}"
    read -rp "Enter your inErrata API key (or press Enter to skip): " api_key
    if [ -n "$api_key" ]; then
        INERRATA_API_KEY="$api_key"
    else
        INERRATA_API_KEY="your-api-key-here"
        echo -e "${DIM}You'll need to add your API key manually later.${NC}"
    fi
fi

# Ensure built
if [ ! -f "$SCRIPT_DIR/dist/index.js" ]; then
    echo -e "${CYAN}Building...${NC}"
    cd "$SCRIPT_DIR"
    npm install
    npm run build
fi

echo ""
echo -e "${BOLD}Detected platforms:${NC}"
echo ""

installed=0

# --- Claude Code ---
if command -v claude &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} Claude Code"
    read -rp "  Install as Claude Code plugin? [Y/n] " yn
    if [[ "${yn:-Y}" =~ ^[Yy]?$ ]]; then
        echo -e "  ${CYAN}Installing plugin...${NC}"
        cd "$SCRIPT_DIR"
        claude plugin install . 2>/dev/null && {
            echo -e "  ${GREEN}✓ Installed!${NC}"
            installed=$((installed + 1))
        } || {
            echo -e "  ${YELLOW}Plugin install failed. Try manually:${NC}"
            echo -e "    cd $SCRIPT_DIR && claude plugin install ."
        }
    fi
else
    echo -e "  ${DIM}✗ Claude Code (not found)${NC}"
fi

# --- OpenCode ---
if command -v opencode &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} OpenCode"
    OPENCODE_CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/opencode.json"
    echo -e "  ${DIM}Add this to your opencode.json (${OPENCODE_CONFIG}):${NC}"
    echo ""
    cat <<EOF
    "inerrata": {
      "type": "local",
      "command": ["node", "$SCRIPT_DIR/dist/index.js"],
      "environment": {
        "INERRATA_API_KEY": "$INERRATA_API_KEY"
      }
    }
EOF
    echo ""
    installed=$((installed + 1))
else
    echo -e "  ${DIM}✗ OpenCode (not found)${NC}"
fi

# --- OpenClaw ---
if command -v openclaw &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} OpenClaw ${DIM}(inErrata is built-in — no config needed!)${NC}"
    installed=$((installed + 1))
fi

# --- Generic MCP ---
echo ""
echo -e "${BOLD}Generic MCP configuration:${NC}"
echo ""
cat <<EOF
{
  "mcpServers": {
    "inerrata": {
      "command": "node",
      "args": ["$SCRIPT_DIR/dist/index.js"],
      "env": {
        "INERRATA_API_KEY": "$INERRATA_API_KEY"
      }
    }
  }
}
EOF

echo ""
if [ "$installed" -gt 0 ]; then
    echo -e "${GREEN}Done!${NC} Configured $installed platform(s)."
else
    echo -e "No auto-configurable platforms detected. Use the generic MCP config above."
fi
echo ""
echo -e "${DIM}Docs: https://github.com/inErrataAI/mcp${NC}"
echo -e "${DIM}API keys: https://inerrata.fly.dev${NC}"
