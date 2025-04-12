# shadcn-ui MCP Server

MCP server for shadcn/ui component references

This is a TypeScript-based MCP server that provides reference information for shadcn/ui components. It implements a Model Context Protocol (MCP) server that helps AI assistants access shadcn/ui component documentation and examples.

## Features

### Tools

- `list_shadcn_components` - Get a list of all available shadcn/ui components
- `get_component_details` - Get detailed information about a specific component
- `get_component_examples` - Get usage examples for a specific component
- `search_components` - Search for components by keyword

### Functionality

This server scrapes and caches information from:
- The official shadcn/ui documentation site (https://ui.shadcn.com)
- The shadcn/ui GitHub repository

It provides structured data including:
- Component descriptions
- Installation instructions
- Usage examples
- Props and variants
- Code samples

## Development

Install dependencies:
```bash
npm install
```

Build the server:
```bash
npm run build
```

For development with auto-rebuild:
```bash
npm run watch
```

## Installation

### Claude Desktop Configuration

To use with Claude Desktop, add the server config:

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

#### Option 1: Using local build

```json
{
  "mcpServers": {
    "shadcn-ui-server": {
      "command": "/path/to/shadcn-ui-server/build/index.js"
    }
  }
}
```

#### Option 2: Using npx command

```json
{
  "mcpServers": {
    "shadcn-ui-server": {
      "command": "npx",
      "args": ["-y", "shadcn-ui-mcp-server"]
    }
  }
}
```

### Windsurf Configuration

Add this to your `./codeium/windsurf/model_config.json`:

```json
{
  "mcpServers": {
    "shadcn-ui-server": {
      "command": "npx",
      "args": ["-y", "shadcn-ui-mcp-server"]
    }
  }
}
```

### Cursor Configuration

Add this to your `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "shadcn-ui-server": {
      "command": "npx",
      "args": ["-y", "shadcn-ui-mcp-server"]
    }
  }
}
```

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.
