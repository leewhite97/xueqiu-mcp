# xueqiu-mcp

An MCP server for Xueqiu (Snowball) that exposes community posts, stock quotes, watchlists, portfolios, and market news to AI assistants through standard Model Context Protocol tools.

It is designed for Claude Desktop, Cursor, Codex, QoderWork, and other MCP-compatible clients that can launch stdio servers.

> This project relies on publicly reachable Xueqiu endpoints and an optional user cookie token. API availability, permissions, and response shapes may change without notice.

## Highlights

| Area | Tools | Capabilities |
| --- | ---: | --- |
| Community and KOL tracking | 11 | User search, profiles, following list, timelines, original articles, post details, comments, hot posts, stock KOLs, news feeds, and 7x24 live news |
| Stock market data | 8 | Single-stock quotes, batch quotes, hot stocks, stock screener, company profiles, dividend history, industry/concept tags, and industry performance |
| Watchlist management | 7 | Read personal or public user watchlists, inspect watchlist stocks, add/remove symbols, and manage folders |
| Portfolio tracking | 2 | Read public Xueqiu portfolios and current holdings |

## Use Cases

- Track recent posts, long-form articles, and discussions from Xueqiu users or market KOLs.
- Query real-time quotes and valuation metrics for A-shares, Hong Kong stocks, and US stocks.
- Inspect your own watchlists or public watchlists from other Xueqiu users.
- Pull Xueqiu hot discussions, news feeds, and 7x24 live updates into AI workflows.
- Combine stock screening, industry data, and company profiles for research workflows.

## Installation

### Requirements

- Node.js 18 or later
- npm
- An MCP client that supports stdio servers

### Build Locally

```bash
git clone <repo-url>
cd xueqiu-mcp
npm install
npm run build
```

The compiled server entrypoint is `dist/index.js`.

## Authentication

Set `XUEQIU_TOKEN` to a logged-in `xq_a_token` copied from your browser. Without this environment variable, the server will try to fetch an anonymous token in memory. Anonymous mode can access some public endpoints, but login-required features such as current-user data and watchlist writes will be unavailable.

### Get `xq_a_token`

1. Log in to [Xueqiu](https://xueqiu.com) in your browser.
2. Open Developer Tools and go to `Application` / `Storage`.
3. Select `Cookies` for `https://xueqiu.com`.
4. Copy the value of `xq_a_token`.

### Claude Desktop / Cursor / QoderWork

Add the server to your MCP client configuration:

```json
{
  "mcpServers": {
    "xueqiu-mcp": {
      "command": "node",
      "args": ["/path/to/xueqiu-mcp/dist/index.js"],
      "env": {
        "XUEQIU_TOKEN": "your xq_a_token value"
      }
    }
  }
}
```

### Codex CLI

Add the server to `~/.codex/config.toml`:

```toml
[mcp_servers.xueqiu-mcp]
command = "node"
args = ["/path/to/xueqiu-mcp/dist/index.js"]
env = { XUEQIU_TOKEN = "your xq_a_token value" }
```

Restart your MCP client after saving the configuration.

## Tools

### Community and KOL Tracking

| Tool | Description | Parameters |
| --- | --- | --- |
| `get_current_user` | Get the current logged-in user profile | None |
| `get_my_following` | Get the current user's following list with automatic pagination | None |
| `search_users` | Search Xueqiu users by keyword | `query`, `page?`, `count?` |
| `get_user_profile` | Get a user's detailed profile | `user_id` |
| `get_user_posts` | Get a user's timeline, including original and reposted content | `user_id`, `page?`, `count?` |
| `get_user_articles` | Get a user's original long-form articles | `user_id`, `page?`, `count?` |
| `get_post_detail` | Get full content for a post or article | `post_id` |
| `get_post_comments` | Get comments for a post | `post_id`, `page?`, `count?`, `sort?` |
| `get_hot_posts` | Get hot posts by day, week, or month | `scope?`, `count?`, `page?` |
| `get_stock_kol` | Get active users for a stock symbol | `symbol`, `count?`, `start?` |
| `get_news_feed` | Get Xueqiu news feeds or 7x24 live news | `category?`, `count?` |

`get_hot_posts.scope` supports `day`, `week`, and `month`. `get_news_feed.category` supports `headline`, `a_stock`, `us_stock`, `hk_stock`, `fund`, and `live`.

### Stock Market Data

| Tool | Description | Parameters |
| --- | --- | --- |
| `get_stock_quote` | Get detailed quote and valuation metrics for one stock | `symbol` |
| `get_batch_quotes` | Get quotes for multiple symbols | `symbols` |
| `get_hot_stocks` | Get hot stock rankings | `market?`, `count?` |
| `screen_stocks` | Sort and screen stocks by percent change, market cap, PE, PB, turnover, amount, or volume | `market?`, `order_by?`, `order?`, `page?`, `size?` |
| `get_company_profile` | Get A-share company profile data | `symbol` |
| `get_stock_dividend` | Get A-share dividend and allotment history | `symbol` |
| `get_stock_industry` | Get industry and concept tags for a stock | `symbol` |
| `get_industry_list` | Get industry sectors and performance data | `level?` |

Symbol examples: `SH600519`, `SZ000001`, `00700`, `AAPL`.

### Watchlist Management

| Tool | Description | Parameters |
| --- | --- | --- |
| `get_watchlists` | Get the current user's watchlist folders | None |
| `get_user_watchlists` | Get public watchlist folders for any user | `user_id` |
| `get_watchlist_stocks` | Get stocks in a watchlist folder, optionally for a public user | `pid`, `category?`, `user_id?` |
| `add_to_watchlist` | Add symbols to a watchlist folder | `pid`, `symbols` |
| `remove_from_watchlist` | Remove symbols from watchlists | `symbols` |
| `create_watchlist` | Create a new watchlist folder | `name` |
| `delete_watchlist` | Delete a watchlist folder | `pid` |

Common system folder IDs include `-1` for all, `-5` for A-shares, `-6` for US stocks, and `-7` for Hong Kong stocks. Prefer IDs returned by `get_watchlists` or `get_user_watchlists`.

### Portfolio Tracking

| Tool | Description | Parameters |
| --- | --- | --- |
| `get_user_cubes` | Get public portfolios created by a Xueqiu user | `user_id`, `page?`, `count?` |
| `get_cube_holdings` | Get current holdings for a portfolio | `cube_symbol` |

## Examples

```text
Show me the latest posts from this Xueqiu user.
```

```text
Search for Xueqiu users who discuss new energy stocks.
```

```text
What is in user 2292705444's public watchlist?
```

```text
Get the current quote, PE, PB, and dividend yield for SH600519.
```

```text
Compare quotes for SH600519, SZ300750, and AAPL.
```

```text
What are the hottest A-share stocks today?
```

```text
Show current holdings for portfolio ZH2001629.
```

```text
Show the latest Xueqiu 7x24 live news.
```

## Development

```bash
npm run dev      # Start from TypeScript source with tsx
npm run build    # Compile TypeScript to dist/
npm start        # Start the compiled MCP server
```

## Architecture

```text
xueqiu-mcp/
├── src/
│   ├── index.ts          # MCP server entrypoint, tool registration, and response formatting
│   └── xueqiu-api.ts     # Xueqiu API client, token handling, and HTTP helpers
├── dist/                 # Compiled output
├── package.json          # Package metadata and scripts
├── tsconfig.json         # TypeScript configuration
└── README.md
```

The implementation intentionally keeps the runtime small:

- Node.js / ESM / ES2022
- TypeScript
- `@modelcontextprotocol/sdk`
- `zod`

## Data, Permissions, and Safety

- `XUEQIU_TOKEN` is read from the environment and should not be committed to source control.
- Anonymous tokens are fetched only when needed and are kept in memory.
- Login-required tools fail fast with a clear error when `XUEQIU_TOKEN` is missing.
- Visibility of other users' watchlists, portfolios, and profiles depends on their privacy settings and Xueqiu's API permissions.
- Xueqiu may change endpoints, fields, rate limits, or access policies at any time.
- Use reasonable request rates and respect Xueqiu's terms of service.

## Disclaimer

This project is for personal learning, research, and automation assistance only. It is not investment advice, trading advice, or a recommendation to buy or sell securities. This project is not affiliated with, endorsed by, or officially authorized by Xueqiu or Beijing Xueqiu Information Technology Co., Ltd. Users are responsible for complying with Xueqiu's terms, platform rules, and applicable laws. All consequences arising from use of this project are the user's responsibility.

## License

MIT
