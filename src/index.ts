#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import fetch from "node-fetch";
import { z } from "zod";
import "dotenv/config";

// Validation schemas
const GetPairsSchema = z.object({
  dex: z.string().optional().describe("DEX platform (raydium, orca, jupiter)"),
  limit: z.number().min(1).max(100).default(20).describe("Number of pairs to return"),
  sort: z.enum(["volume", "liquidity", "price_change"]).default("volume").describe("Sort order")
});

const GetLiquiditySchema = z.object({
  pool_address: z.string().describe("Pool address to get liquidity data for"),
  dex: z.string().optional().describe("DEX platform")
});

const GetTokenPairSchema = z.object({
  token_a: z.string().describe("First token mint address"),
  token_b: z.string().describe("Second token mint address"),
  dex: z.string().optional().describe("DEX platform to search on")
});

const GetPoolStatsSchema = z.object({
  pool_address: z.string().describe("Pool address to get statistics for")
});

// Solana connection
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const connection = new Connection(SOLANA_RPC_URL, "confirmed");

// DEX API configurations
const DEX_APIS = {
  raydium: {
    pools: "https://api.raydium.io/v2/sdk/liquidity/mainnet.json",
    pairs: "https://api.raydium.io/v2/main/pairs"
  },
  orca: {
    pools: "https://api.orca.so/v1/whirlpool/list",
    pairs: "https://api.orca.so/v1/whirlpool/list"
  },
  jupiter: {
    tokens: "https://token.jup.ag/all",
    price: "https://price.jup.ag/v4/price"
  }
};

class SolanaLiquidityService {
  // Get real-time trading pairs data
  async getTradingPairs(dex?: string, limit: number = 20, sort: string = "volume") {
    try {
      if (dex === "raydium" || !dex) {
        const response = await fetch(DEX_APIS.raydium.pairs);
        const data = await response.json() as any;
        
        let pairs = data.data || [];
        
        // Sort pairs based on criteria
        switch (sort) {
          case "volume":
            pairs = pairs.sort((a: any, b: any) => (b.volume24h || 0) - (a.volume24h || 0));
            break;
          case "liquidity":
            pairs = pairs.sort((a: any, b: any) => (b.liquidity || 0) - (a.liquidity || 0));
            break;
          case "price_change":
            pairs = pairs.sort((a: any, b: any) => Math.abs(b.priceChange24h || 0) - Math.abs(a.priceChange24h || 0));
            break;
        }
        
        return pairs.slice(0, limit).map((pair: any) => ({
          pool_address: pair.ammId,
          base_mint: pair.baseMint,
          quote_mint: pair.quoteMint,
          base_symbol: pair.baseSymbol,
          quote_symbol: pair.quoteSymbol,
          price: pair.price,
          volume_24h: pair.volume24h,
          liquidity_usd: pair.liquidity,
          price_change_24h: pair.priceChange24h,
          dex: "raydium",
          last_updated: new Date().toISOString()
        }));
      }
      
      // Add support for other DEXes
      if (dex === "orca") {
        const response = await fetch(DEX_APIS.orca.pools);
        const data = await response.json() as any;
        
        return (data.whirlpools || []).slice(0, limit).map((pool: any) => ({
          pool_address: pool.address,
          base_mint: pool.tokenA?.mint,
          quote_mint: pool.tokenB?.mint,
          base_symbol: pool.tokenA?.symbol,
          quote_symbol: pool.tokenB?.symbol,
          price: pool.price,
          volume_24h: pool.volume?.day,
          liquidity_usd: pool.tvl,
          price_change_24h: pool.priceChange?.day,
          dex: "orca",
          last_updated: new Date().toISOString()
        }));
      }
      
      return [];
    } catch (error) {
      throw new Error(`Failed to fetch trading pairs: ${error}`);
    }
  }

  // Get detailed liquidity information for a specific pool
  async getPoolLiquidity(poolAddress: string, dex?: string) {
    try {
      const poolPubkey = new PublicKey(poolAddress);
      
      // Get on-chain pool account data
      const poolAccount = await connection.getAccountInfo(poolPubkey);
      if (!poolAccount) {
        throw new Error("Pool not found on-chain");
      }
      
      // Fetch additional data from DEX APIs
      let poolData: any = {};
      
      if (dex === "raydium" || !dex) {
        try {
          const response = await fetch(DEX_APIS.raydium.pairs);
          const data = await response.json() as any;
          const pool = (data.data || []).find((p: any) => p.ammId === poolAddress);
          if (pool) {
            poolData = pool;
          }
        } catch (e) {
          console.warn("Could not fetch Raydium data:", e);
        }
      }
      
      return {
        pool_address: poolAddress,
        base_mint: poolData.baseMint,
        quote_mint: poolData.quoteMint,
        base_symbol: poolData.baseSymbol,
        quote_symbol: poolData.quoteSymbol,
        base_reserve: poolData.baseReserve,
        quote_reserve: poolData.quoteReserve,
        liquidity_usd: poolData.liquidity,
        volume_24h: poolData.volume24h,
        fees_24h: poolData.fees24h,
        apy: poolData.apy,
        price: poolData.price,
        price_change_24h: poolData.priceChange24h,
        dex: dex || "unknown",
        on_chain_data: {
          lamports: poolAccount.lamports,
          owner: poolAccount.owner.toString(),
          executable: poolAccount.executable,
          rent_epoch: poolAccount.rentEpoch
        },
        last_updated: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Failed to fetch pool liquidity: ${error}`);
    }
  }

  // Find trading pairs for specific tokens
  async findTokenPair(tokenA: string, tokenB: string, dex?: string) {
    try {
      const pairs = await this.getTradingPairs(dex, 100);
      
      const matchingPairs = pairs.filter((pair: any) => 
        (pair.base_mint === tokenA && pair.quote_mint === tokenB) ||
        (pair.base_mint === tokenB && pair.quote_mint === tokenA)
      );
      
      if (matchingPairs.length === 0) {
        // Try to find pairs where either token appears
        const relatedPairs = pairs.filter((pair: any) => 
          pair.base_mint === tokenA || pair.quote_mint === tokenA ||
          pair.base_mint === tokenB || pair.quote_mint === tokenB
        );
        
        return {
          direct_pairs: [],
          related_pairs: relatedPairs.slice(0, 10),
          message: "No direct trading pairs found, showing related pairs"
        };
      }
      
      return {
        direct_pairs: matchingPairs,
        related_pairs: [],
        message: "Direct trading pairs found"
      };
    } catch (error) {
      throw new Error(`Failed to find token pairs: ${error}`);
    }
  }

  // Get comprehensive pool statistics
  async getPoolStats(poolAddress: string) {
    try {
      const poolLiquidity = await this.getPoolLiquidity(poolAddress);
      
      // Calculate additional metrics
      const volume24h = poolLiquidity.volume_24h || 0;
      const liquidity = poolLiquidity.liquidity_usd || 0;
      const fees24h = poolLiquidity.fees_24h || 0;
      
      const volumeToLiquidityRatio = liquidity > 0 ? volume24h / liquidity : 0;
      const feesApr = liquidity > 0 ? (fees24h * 365 / liquidity) * 100 : 0;
      
      return {
        ...poolLiquidity,
        metrics: {
          volume_to_liquidity_ratio: volumeToLiquidityRatio,
          fees_apr: feesApr,
          utilization: volumeToLiquidityRatio > 0 ? Math.min(volumeToLiquidityRatio * 100, 100) : 0,
          health_score: this.calculatePoolHealth(poolLiquidity)
        },
        risk_analysis: {
          impermanent_loss_risk: this.assessImpermanentLossRisk(poolLiquidity),
          liquidity_risk: liquidity < 10000 ? "high" : liquidity < 100000 ? "medium" : "low",
          volume_consistency: this.assessVolumeConsistency(volume24h)
        }
      };
    } catch (error) {
      throw new Error(`Failed to get pool statistics: ${error}`);
    }
  }

  private calculatePoolHealth(poolData: any): number {
    let score = 100;
    
    // Deduct points for low liquidity
    if (poolData.liquidity_usd < 10000) score -= 30;
    else if (poolData.liquidity_usd < 100000) score -= 15;
    
    // Deduct points for high price volatility
    const priceChange = Math.abs(poolData.price_change_24h || 0);
    if (priceChange > 20) score -= 25;
    else if (priceChange > 10) score -= 15;
    
    // Deduct points for low volume
    if (poolData.volume_24h < 1000) score -= 20;
    else if (poolData.volume_24h < 10000) score -= 10;
    
    return Math.max(0, score);
  }

  private assessImpermanentLossRisk(poolData: any): string {
    const priceChange = Math.abs(poolData.price_change_24h || 0);
    if (priceChange > 15) return "high";
    if (priceChange > 5) return "medium";
    return "low";
  }

  private assessVolumeConsistency(volume24h: number): string {
    // Simplified volume consistency assessment
    if (volume24h > 100000) return "high";
    if (volume24h > 10000) return "medium";
    return "low";
  }
}

// Create server instance
const server = new Server(
  {
    name: "solana-pairs-liquidity-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const liquidityService = new SolanaLiquidityService();

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_solana_pairs",
        description: "Get real-time Solana trading pairs data from various DEXes",
        inputSchema: {
          type: "object",
          properties: {
            dex: {
              type: "string",
              description: "DEX platform (raydium, orca, jupiter)",
              enum: ["raydium", "orca", "jupiter"]
            },
            limit: {
              type: "number",
              description: "Number of pairs to return (1-100)",
              minimum: 1,
              maximum: 100,
              default: 20
            },
            sort: {
              type: "string",
              description: "Sort order",
              enum: ["volume", "liquidity", "price_change"],
              default: "volume"
            }
          }
        }
      },
      {
        name: "get_pool_liquidity",
        description: "Get detailed liquidity information for a specific Solana pool",
        inputSchema: {
          type: "object",
          properties: {
            pool_address: {
              type: "string",
              description: "Pool address to get liquidity data for"
            },
            dex: {
              type: "string",
              description: "DEX platform",
              enum: ["raydium", "orca", "jupiter"]
            }
          },
          required: ["pool_address"]
        }
      },
      {
        name: "find_token_pair",
        description: "Find trading pairs for specific tokens on Solana",
        inputSchema: {
          type: "object",
          properties: {
            token_a: {
              type: "string",
              description: "First token mint address"
            },
            token_b: {
              type: "string",
              description: "Second token mint address"
            },
            dex: {
              type: "string",
              description: "DEX platform to search on",
              enum: ["raydium", "orca", "jupiter"]
            }
          },
          required: ["token_a", "token_b"]
        }
      },
      {
        name: "get_pool_stats",
        description: "Get comprehensive statistics and analysis for a Solana liquidity pool",
        inputSchema: {
          type: "object",
          properties: {
            pool_address: {
              type: "string",
              description: "Pool address to get statistics for"
            }
          },
          required: ["pool_address"]
        }
      }
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "get_solana_pairs": {
        const args = GetPairsSchema.parse(request.params.arguments);
        const pairs = await liquidityService.getTradingPairs(args.dex, args.limit, args.sort);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                data: pairs,
                count: pairs.length,
                timestamp: new Date().toISOString()
              }, null, 2),
            },
          ],
        };
      }

      case "get_pool_liquidity": {
        const args = GetLiquiditySchema.parse(request.params.arguments);
        const liquidity = await liquidityService.getPoolLiquidity(args.pool_address, args.dex);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                data: liquidity,
                timestamp: new Date().toISOString()
              }, null, 2),
            },
          ],
        };
      }

      case "find_token_pair": {
        const args = GetTokenPairSchema.parse(request.params.arguments);
        const pairs = await liquidityService.findTokenPair(args.token_a, args.token_b, args.dex);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                data: pairs,
                timestamp: new Date().toISOString()
              }, null, 2),
            },
          ],
        };
      }

      case "get_pool_stats": {
        const args = GetPoolStatsSchema.parse(request.params.arguments);
        const stats = await liquidityService.getPoolStats(args.pool_address);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                data: stats,
                timestamp: new Date().toISOString()
              }, null, 2),
            },
          ],
        };
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }
    
    throw new McpError(
      ErrorCode.InternalError,
      `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Solana Pairs & Liquidity MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
}); 