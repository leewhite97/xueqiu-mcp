# xueqiu-mcp

雪球（Xueqiu）MCP Server，为 AI 助手提供雪球社区数据访问能力。支持追踪大 V 动态、查看自选股与组合持仓、获取实时行情与资讯，共 28 个工具。

## 功能概览

| 类别 | 工具数 | 说明 |
|------|--------|------|
| 社交 / 大 V 追踪 | 11 | 用户搜索、帖子、文章、评论、热门、KOL、资讯 |
| 股票行情 | 8 | 实时行情、批量报价、热门排行、选股器、公司信息、分红、行业 |
| 自选股管理 | 7 | 查看/添加/删除自选，支持查看任意用户的自选股 |
| 组合追踪 | 2 | 查看任意用户的雪球组合及持仓明细 |

## 工具清单

### 社交 / 大 V 追踪

| 工具 | 说明 | 参数 |
|------|------|------|
| `get_current_user` | 获取当前登录用户信息 | 无 |
| `get_my_following` | 获取我的关注列表（自动翻页） | 无 |
| `search_users` | 按关键词搜索雪球用户 | `query`, `page?`, `count?` |
| `get_user_profile` | 获取用户详细资料 | `user_id` |
| `get_user_posts` | 获取用户动态（含原创和转发） | `user_id`, `page?`, `count?` |
| `get_user_articles` | 获取用户原创文章 | `user_id`, `page?`, `count?` |
| `get_post_detail` | 获取帖子完整内容 | `post_id` |
| `get_post_comments` | 获取帖子评论 | `post_id`, `page?`, `count?`, `sort?` |
| `get_hot_posts` | 热门帖子排行 | `scope?`(day/week/month), `count?`, `page?` |
| `get_stock_kol` | 获取某只股票的活跃大 V | `symbol`, `count?`, `start?` |
| `get_news_feed` | 资讯 Feed 流 | `category?`(headline/a_stock/us_stock/hk_stock/fund/live), `count?` |

### 股票行情

| 工具 | 说明 | 参数 |
|------|------|------|
| `get_stock_quote` | 单只股票详细行情（现价、PE、PB、市值、股息率等） | `symbol` |
| `get_batch_quotes` | 批量获取多只股票行情 | `symbols`(逗号分隔) |
| `get_hot_stocks` | 热门股票排行榜 | `market?`(A/HK/US), `count?` |
| `screen_stocks` | 股票筛选器（按涨跌幅、市值、PE 等排序） | `market?`, `order_by?`, `order?`, `page?`, `size?` |
| `get_company_profile` | A 股公司基本信息（名称、法人、主营业务等） | `symbol` |
| `get_stock_dividend` | A 股分红送转历史 | `symbol` |
| `get_stock_industry` | 股票所属行业/概念板块 | `symbol` |
| `get_industry_list` | 行业板块列表及涨跌数据 | `level?` |

### 自选股管理

| 工具 | 说明 | 参数 |
|------|------|------|
| `get_watchlists` | 获取自己的自选股分组列表 | 无 |
| `get_user_watchlists` | 获取任意用户的自选股分组（文件夹 + 数量统计） | `user_id` |
| `get_watchlist_stocks` | 获取分组下的股票列表（传入 `user_id` 可查看他人自选） | `pid`, `category?`, `user_id?` |
| `add_to_watchlist` | 添加股票到自选分组 | `pid`, `symbols` |
| `remove_from_watchlist` | 从自选中删除股票 | `symbols` |
| `create_watchlist` | 创建新的自选分组 | `name` |
| `delete_watchlist` | 删除自选分组 | `pid` |

常用 `pid` 值：`-1`=全部、`-5`=沪深、`-6`=美股、`-7`=港股。

### 组合追踪

| 工具 | 说明 | 参数 |
|------|------|------|
| `get_user_cubes` | 获取用户的投资组合列表（名称、收益率、关注人数） | `user_id`, `page?`, `count?` |
| `get_cube_holdings` | 获取组合的当前持仓（股票名称、代码、仓位占比） | `cube_symbol` |

## 安装

### 1. 安装依赖并编译

```bash
git clone <repo-url>
cd xueqiu-mcp
npm install
npm run build
```

### 2. 获取 Token

1. 在浏览器中登录 https://xueqiu.com
2. 按 F12 → Application → Cookies → xueqiu.com
3. 复制 `xq_a_token` 的值

### 3. 配置 MCP 客户端

#### Claude Desktop / Cursor / QoderWork

在 MCP 客户端配置文件中添加：

```json
{
  "mcpServers": {
    "xueqiu-mcp": {
      "command": "node",
      "args": ["/你的路径/xueqiu-mcp/dist/index.js"],
      "env": {
        "XUEQIU_TOKEN": "你的 xq_a_token 值"
      }
    }
  }
}
```

#### Codex CLI

编辑 `~/.codex/config.toml`，添加：

```toml
[mcp_servers.xueqiu-mcp]
command = "node"
args = ["/你的路径/xueqiu-mcp/dist/index.js"]
env = { XUEQIU_TOKEN = "你的 xq_a_token 值" }
```

保存后重启 Codex 即可生效。

将路径和 Token 替换为你的实际值。若未配置 Token，服务会自动获取匿名 Token（部分功能受限）。

## 使用示例

### 追踪大 V

> "看看药神最近发了什么帖子"

> "搜索雪球上关注新能源的大 V"

### 查看他人自选股

> "帮我看看药神（ID: 2292705444）的自选股里有什么"

> "看看某用户的 A 股自选列表"

### 行情查询

> "贵州茅台现在什么价格？"

> "帮我对比一下宁德时代和比亚迪的行情"

> "今天 A 股涨幅最大的有哪些？"

### 组合追踪

> "看看某用户有哪些投资组合"

> "ZH2001629 这个组合目前持仓了哪些股票？"

### 资讯获取

> "今天雪球上有什么热门讨论？"

> "看看最新的美股资讯"

> "雪球 7x24 快讯"

## 技术栈

- **运行时**：Node.js（ES2022 / ESM）
- **MCP SDK**：@modelcontextprotocol/sdk ^1.12.1
- **参数校验**：zod ^3.23.8
- **语言**：TypeScript ^5.6.0

## 项目结构

```
xueqiu-mcp/
├── src/
│   ├── index.ts          # MCP Server 入口 & 工具注册
│   └── xueqiu-api.ts     # 雪球 API 客户端封装
├── dist/                 # 编译输出
├── package.json
├── tsconfig.json
└── README.md
```

## 注意事项

- 本工具基于雪球公开可访问的数据接口，接口可能随时调整。
- `xq_a_token` 存在有效期限制，过期后需重新从浏览器获取。
- 查看他人自选股依赖对方的隐私设置，部分用户的自选可能不可见。
- 请合理控制请求频率。

## 免责声明

- 本项目仅供个人学习与研究用途，不构成任何投资建议。
- 本项目与北京雪球信息咨询有限公司（雪球）无关，未获得雪球的官方授权或认可。
- 数据来源于雪球平台的公开信息，使用者应自行遵守雪球的《用户协议》及相关法律法规。
- 因使用本项目产生的一切后果，由使用者自行承担。
- 如涉及版权问题，请联系作者进行处理。

## License

MIT
