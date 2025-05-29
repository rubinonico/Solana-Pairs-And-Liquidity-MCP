# Solana Pairs & Liquidity MCP Server

MCP Server for real-time Solana blockchain liquidity and token pairs data. Provides access to trading pairs, liquidity pools, and DeFi analytics across major Solana DEXes including Raydium, Orca, and Jupiter.

## Features

- **Real-time Trading Pairs**: Get live trading pairs data from multiple Solana DEXes
- **Liquidity Analytics**: Detailed liquidity information for specific pools
- **Token Pair Discovery**: Find trading pairs for specific token combinations
- **Pool Statistics**: Comprehensive statistics and risk analysis for liquidity pools
- **Multi-DEX Support**: Support for Raydium, Orca, and Jupiter aggregation
- **Risk Assessment**: Built-in impermanent loss and liquidity risk analysis

## Setup

### Environment Variables

Create a `.env` file in the project root:

```env
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

Optional: You can use a custom Solana RPC URL for better performance.

### Usage with MCP clients

Add the following to your client configuration:

#### NPX

```json
{
  "mcpServers": {
    "solana-pairs-liquidity-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@solana/solana-pairs-liquidity-mcp"
      ],
      "env": {
        "SOLANA_RPC_URL": "https://api.mainnet-beta.solana.com"
      }
    }
  }
}
```

#### Docker

```json
{
  "mcpServers": {
    "solana-pairs-liquidity-mcp": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "SOLANA_RPC_URL",
        "solana/solana-pairs-liquidity-mcp"
      ],
      "env": {
        "SOLANA_RPC_URL": "https://api.mainnet-beta.solana.com"
      }
    }
  }
}
```

## Available Tools

### `get_solana_pairs`

Get real-time Solana trading pairs data from various DEXes.

**Parameters:**
- `dex` (optional): DEX platform (raydium, orca, jupiter)
- `limit` (optional): Number of pairs to return (1-100, default: 20)
- `sort` (optional): Sort order (volume, liquidity, price_change, default: volume)

**Example:**
```json
{
  "dex": "raydium",
  "limit": 10,
  "sort": "volume"
}
```

### `get_pool_liquidity`

Get detailed liquidity information for a specific Solana pool.

**Parameters:**
- `pool_address` (required): Pool address to get liquidity data for
- `dex` (optional): DEX platform

**Example:**
```json
{
  "pool_address": "2QdhepnKRTLjjSqPL1PtKNwqrUkoLee5Gqs8bvZhRdMv",
  "dex": "raydium"
}
```

### `find_token_pair`

Find trading pairs for specific tokens on Solana.

**Parameters:**
- `token_a` (required): First token mint address
- `token_b` (required): Second token mint address
- `dex` (optional): DEX platform to search on

**Example:**
```json
{
  "token_a": "So11111111111111111111111111111111111111112",
  "token_b": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
}
```

### `get_pool_stats`

Get comprehensive statistics and analysis for a Solana liquidity pool.

**Parameters:**
- `pool_address` (required): Pool address to get statistics for

**Example:**
```json
{
  "pool_address": "2QdhepnKRTLjjSqPL1PtKNwqrUkoLee5Gqs8bvZhRdMv"
}
```

## Response Format

All tools return data in the following format:

```json
{
  "success": true,
  "data": {
    // Tool-specific data
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Data Sources

This MCP server integrates with multiple Solana DeFi protocols:

- **Raydium**: AMM and liquidity pools
- **Orca**: Concentrated liquidity (Whirlpools)
- **Jupiter**: Aggregated pricing and routing data
- **Solana RPC**: On-chain account verification

## Build

To build the project locally:

```bash
npm install
npm run build
```

This command installs dependencies, compiles TypeScript to JavaScript, and sets execute permissions.

## Development

For development with hot reload:

```bash
npm run dev
```

## Testing

Run the test suite:

```bash
npm test
```

## Common Use Cases

### Portfolio Analysis
Get liquidity positions and analyze pool performance for portfolio tracking.

### DeFi Research
Research token pairs, liquidity distribution, and DEX performance metrics.

### Risk Assessment
Evaluate impermanent loss risk and liquidity stability for investment decisions.

### Market Analysis
Track trading volume, price movements, and liquidity trends across Solana DEXes.

## Supported Networks

- Solana Mainnet-Beta

## License

This MCP server is licensed under the MIT License. See the [LICENSE](LICENSE) file for details. 