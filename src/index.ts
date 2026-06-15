#!/usr/bin/env node

/**
 * Xueqiu MCP Server (v2)
 * 雪球社区 + 行情 + 自选管理 MCP Server
 *
 * Token 通过环境变量 XUEQIU_TOKEN 配置，无运行时认证工具。
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  XueqiuClient,
  type StockQuote,
  type HotStock,
  type ScreenedStock,
  type WatchlistStock,
} from "./xueqiu-api.js";

// ─── Helpers ───────────────────────────────────────────────────────

function cleanHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function formatDate(raw: string | number | undefined): string {
  if (raw === undefined) return "未知";
  try {
    const d = typeof raw === "number" ? new Date(raw) : new Date(raw);
    if (isNaN(d.getTime())) return String(raw);
    return d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  } catch {
    return String(raw);
  }
}

function formatPost(post: {
  id?: number;
  title?: string;
  text?: string;
  description?: string;
  created_at?: string | number;
  user?: { screen_name?: string; id?: number };
  user_id?: number;
  target?: string;
  view_count?: number;
  reply_count?: number;
  comment_count?: number;
  retweet_count?: number;
  like_count?: number;
  fav_count?: number;
  retweeted_status?: unknown;
  source?: string;
}): string {
  const lines: string[] = [];
  if (post.title) lines.push(`标题: ${post.title}`);
  if (post.user)
    lines.push(
      `作者: ${post.user.screen_name ?? "未知"} (ID: ${post.user.id ?? "?"})`
    );
  if (post.created_at) lines.push(`时间: ${formatDate(post.created_at)}`);
  const uid = post.user?.id ?? post.user_id ?? "";
  if (post.id) lines.push(`链接: https://xueqiu.com${post.target ?? `/${uid}/${post.id}`}`);

  const content = cleanHtml(post.text ?? post.description ?? "");
  if (content) {
    const truncated = content.length > 2000 ? content.slice(0, 2000) + "..." : content;
    lines.push(`\n---\n${truncated}\n---`);
  }

  const stats: string[] = [];
  if (post.view_count !== undefined) stats.push(`浏览 ${post.view_count}`);
  if (post.reply_count !== undefined) stats.push(`回复 ${post.reply_count}`);
  if (post.retweet_count !== undefined) stats.push(`转发 ${post.retweet_count}`);
  if (post.like_count !== undefined) stats.push(`点赞 ${post.like_count}`);
  if (stats.length > 0) lines.push(`数据: ${stats.join("  ")}`);

  return lines.join("\n");
}

function formatUser(user: {
  id?: number;
  screen_name?: string;
  description?: string;
  followers_count?: number;
  friends_count?: number;
  status_count?: number;
  verified?: boolean;
  verified_description?: string;
}): string {
  const lines: string[] = [];
  lines.push(`${user.screen_name ?? "未知"} (ID: ${user.id ?? "?"})`);
  if (user.verified && user.verified_description)
    lines.push(`认证: ${user.verified_description}`);
  if (user.description) lines.push(`简介: ${user.description}`);
  if (user.followers_count !== undefined)
    lines.push(`粉丝: ${user.followers_count}  |  关注: ${user.friends_count ?? 0}  |  发帖: ${user.status_count ?? 0}`);
  lines.push(`主页: https://xueqiu.com/u/${user.id}`);
  return lines.join("\n");
}

function formatQuote(q: StockQuote): string {
  const lines: string[] = [];
  lines.push(`${q.name ?? q.symbol} (${q.symbol})`);
  if (q.current != null) {
    const chgStr = q.chg != null ? `${q.chg >= 0 ? "+" : ""}${q.chg.toFixed(2)}` : "";
    const pctStr = q.percent != null ? `${q.percent >= 0 ? "+" : ""}${q.percent.toFixed(2)}%` : "";
    lines.push(`现价: ${q.current}  ${chgStr}  ${pctStr}`);
  }
  const metrics: string[] = [];
  if (q.market_capital != null) metrics.push(`市值: ${(q.market_capital / 1e8).toFixed(2)}亿`);
  if (q.pe_ttm != null) metrics.push(`PE(TTM): ${q.pe_ttm.toFixed(2)}`);
  if (q.pb != null) metrics.push(`PB: ${q.pb.toFixed(2)}`);
  if (q.dividend_yield != null) metrics.push(`股息率: ${q.dividend_yield.toFixed(2)}%`);
  if (q.turnover_rate != null) metrics.push(`换手率: ${q.turnover_rate.toFixed(2)}%`);
  if (q.volume != null) metrics.push(`成交量: ${(q.volume / 10000).toFixed(0)}万手`);
  if (q.amount != null) metrics.push(`成交额: ${(q.amount / 1e8).toFixed(2)}亿`);
  if (metrics.length > 0) lines.push(metrics.join("  "));
  return lines.join("\n");
}

// ─── Server Setup ──────────────────────────────────────────────────

const server = new McpServer({
  name: "xueqiu-mcp",
  version: "2.0.0",
});

const client = new XueqiuClient();

// ═══════════════════════════════════════════════════════════════════
//  社交 / 大V追踪
// ═══════════════════════════════════════════════════════════════════

server.tool(
  "get_current_user",
  "获取当前登录用户的信息，包括昵称、ID、粉丝数等。需要 XUEQIU_TOKEN 环境变量。",
  {},
  async () => {
    const user = await client.getCurrentUser();
    return {
      content: [{ type: "text", text: `当前登录用户：\n\n${formatUser(user)}` }],
    };
  }
);

server.tool(
  "get_my_following",
  "获取当前登录用户关注的人的列表。会自动获取所有分页，返回完整的关注列表。",
  {},
  async () => {
    const me = await client.getCurrentUser();
    const myId = me.id;
    const allUsers: typeof me[] = [];
    let page = 1;
    const PAGE_SIZE = 20;

    while (true) {
      const result = await client.getFollowing(myId, page, 0);
      const users = result.users ?? [];
      if (users.length === 0) break;
      allUsers.push(...users);
      if (users.length < PAGE_SIZE) break;
      page++;
      if (page > 50) break;
    }

    if (allUsers.length === 0) {
      return { content: [{ type: "text", text: "你还没有关注任何人。" }] };
    }

    const text = allUsers.map(formatUser).join("\n\n---\n\n");
    return {
      content: [{ type: "text", text: `${me.screen_name ?? "你"}共关注 ${allUsers.length} 人：\n\n${text}` }],
    };
  }
);

server.tool(
  "search_users",
  "搜索雪球用户。可按关键词搜索大V，获取用户ID、昵称、粉丝数等信息。",
  {
    query: z.string().describe("搜索关键词，如用户名或昵称"),
    page: z.number().optional().default(1).describe("页码，默认1"),
    count: z.number().optional().default(10).describe("每页数量，默认10"),
  },
  async ({ query, page, count }) => {
    const result = await client.searchUsers(query, page, count);
    const users = result.users ?? [];
    if (users.length === 0) {
      return { content: [{ type: "text", text: `未找到匹配「${query}」的用户。` }] };
    }
    const text = users.map(formatUser).join("\n\n---\n\n");
    return { content: [{ type: "text", text: `找到 ${users.length} 个用户：\n\n${text}` }] };
  }
);

server.tool(
  "get_user_profile",
  "获取雪球用户的详细资料，包括昵称、简介、粉丝数、认证信息等。",
  {
    user_id: z.string().describe("雪球用户ID（纯数字），可从用户主页URL获取"),
  },
  async ({ user_id }) => {
    const user = await client.getUserProfile(user_id);
    return { content: [{ type: "text", text: formatUser(user) }] };
  }
);

server.tool(
  "get_user_posts",
  "获取指定雪球用户的最新动态（包含原创和转发）。适合追踪大V的所有发言。",
  {
    user_id: z.string().describe("雪球用户ID（纯数字）"),
    page: z.number().optional().default(1).describe("页码，默认1"),
    count: z.number().optional().default(10).describe("每页数量，默认10，最大20"),
  },
  async ({ user_id, page, count }) => {
    const result = await client.getUserPosts(user_id, page, count);
    const posts = result.statuses ?? [];
    if (posts.length === 0) {
      return { content: [{ type: "text", text: "该用户暂无动态。" }] };
    }
    const text = posts.map(formatPost).join("\n\n---\n\n");
    return { content: [{ type: "text", text: `共 ${posts.length} 条动态：\n\n${text}` }] };
  }
);

server.tool(
  "get_user_articles",
  "获取指定雪球用户的原创文章（不含转发）。适合追踪大V的深度分析和长文。",
  {
    user_id: z.string().describe("雪球用户ID（纯数字）"),
    page: z.number().optional().default(1).describe("页码，默认1"),
    count: z.number().optional().default(10).describe("每页数量，默认10"),
  },
  async ({ user_id, page, count }) => {
    const result = await client.getUserArticles(user_id, page, count);
    const posts = result.statuses ?? [];
    if (posts.length === 0) {
      return { content: [{ type: "text", text: "该用户暂无原创文章。" }] };
    }
    const text = posts.map(formatPost).join("\n\n---\n\n");
    return { content: [{ type: "text", text: `共 ${posts.length} 篇原创文章：\n\n${text}` }] };
  }
);

server.tool(
  "get_post_detail",
  "获取某篇雪球帖子/文章的完整内容，包括正文、互动数据等。",
  {
    post_id: z.string().describe("帖子ID（纯数字），可从帖子URL中获取"),
  },
  async ({ post_id }) => {
    const post = await client.getPostDetail(post_id);
    return { content: [{ type: "text", text: formatPost(post) }] };
  }
);

server.tool(
  "get_post_comments",
  "获取某篇雪球帖子下的评论。",
  {
    post_id: z.string().describe("帖子ID（纯数字）"),
    page: z.number().optional().default(1).describe("页码，默认1"),
    count: z.number().optional().default(20).describe("每页数量，默认20"),
    sort: z.enum(["newest", "oldest"]).optional().default("newest").describe("排序：newest 或 oldest"),
  },
  async ({ post_id, page, count, sort }) => {
    const result = await client.getPostComments(post_id, page, count, sort === "oldest");
    const comments = result.comments ?? [];
    if (comments.length === 0) {
      return { content: [{ type: "text", text: "该帖子暂无评论。" }] };
    }
    const text = comments
      .map((c) => {
        const lines: string[] = [];
        lines.push(`${c.user?.screen_name ?? "匿名"} (${formatDate(c.created_at)})`);
        lines.push(cleanHtml(c.text));
        if (c.like_count) lines.push(`点赞 ${c.like_count}`);
        return lines.join("\n");
      })
      .join("\n\n---\n\n");
    return { content: [{ type: "text", text: `共 ${comments.length} 条评论：\n\n${text}` }] };
  }
);

server.tool(
  "get_hot_posts",
  "获取雪球热门帖子列表。可按日、周、月筛选热度排行。适合发现当前市场热点话题。",
  {
    scope: z.enum(["day", "week", "month"]).optional().default("day").describe("时间范围：day（今日）、week（本周）、month（本月）"),
    count: z.number().optional().default(10).describe("数量，默认10"),
    page: z.number().optional().default(1).describe("页码，默认1"),
  },
  async ({ scope, count, page }) => {
    const result = await client.getHotPosts(scope, count, page);
    const posts = Array.isArray(result) ? result : [];
    if (posts.length === 0) {
      return { content: [{ type: "text", text: "暂无热门帖子。" }] };
    }
    const text = posts.map(formatPost).join("\n\n---\n\n");
    const scopeLabel = { day: "今日", week: "本周", month: "本月" }[scope];
    return { content: [{ type: "text", text: `${scopeLabel}热门帖子 Top ${posts.length}：\n\n${text}` }] };
  }
);

server.tool(
  "get_stock_kol",
  "获取某个股票下的活跃大V/KOL列表。适合发现关注特定标的的意见领袖。",
  {
    symbol: z.string().describe("股票代码，如 SH600519、AAPL、00700"),
    count: z.number().optional().default(10).describe("数量，默认10"),
    start: z.number().optional().default(0).describe("起始偏移量，默认0"),
  },
  async ({ symbol, count, start }) => {
    const result = await client.getStockKOL(symbol, start, count);
    const users = result.users ?? [];
    if (users.length === 0) {
      return { content: [{ type: "text", text: `${symbol} 暂无活跃大V。` }] };
    }
    const text = users.map(formatUser).join("\n\n---\n\n");
    return { content: [{ type: "text", text: `${symbol} 活跃大V ${users.length} 人：\n\n${text}` }] };
  }
);

server.tool(
  "get_news_feed",
  "获取雪球资讯Feed流。可按分类筛选：头条、A股、美股、港股、基金等。",
  {
    category: z
      .enum(["headline", "a_stock", "us_stock", "hk_stock", "fund", "live"])
      .optional()
      .default("headline")
      .describe("分类：headline（头条）、a_stock（A股）、us_stock（美股）、hk_stock（港股）、fund（基金）、live（7x24快讯）"),
    count: z.number().optional().default(10).describe("数量，默认10"),
  },
  async ({ category, count }) => {
    const categoryMap: Record<string, number> = {
      headline: -1, a_stock: 105, us_stock: 101, hk_stock: 102, fund: 104,
    };

    if (category === "live") {
      const result = await client.getLiveNews(count);
      const items = result.items ?? [];
      if (items.length === 0) return { content: [{ type: "text", text: "暂无快讯。" }] };
      const text = items
        .map((item) => `[${formatDate(item.created_at)}] ${cleanHtml(item.text)}`)
        .join("\n\n");
      return { content: [{ type: "text", text: `7x24 快讯 ${items.length} 条：\n\n${text}` }] };
    }

    const catId = categoryMap[category] ?? -1;
    const result = await client.getNewsFeed(catId, count);
    const posts = result.list ?? [];
    if (posts.length === 0) return { content: [{ type: "text", text: "暂无资讯。" }] };
    const text = posts.map(formatPost).join("\n\n---\n\n");
    const labelMap: Record<string, string> = {
      headline: "头条", a_stock: "A股", us_stock: "美股", hk_stock: "港股", fund: "基金",
    };
    return { content: [{ type: "text", text: `${labelMap[category] ?? "头条"} 资讯 ${posts.length} 条：\n\n${text}` }] };
  }
);

// ═══════════════════════════════════════════════════════════════════
//  股票行情数据
// ═══════════════════════════════════════════════════════════════════

server.tool(
  "get_stock_quote",
  "获取单只股票的详细实时行情，包括现价、涨跌幅、PE/PB、市值、股息率、换手率等。",
  {
    symbol: z.string().describe("股票代码，A股如 SH600519、SZ000001；港股如 00700；美股如 AAPL"),
  },
  async ({ symbol }) => {
    const q = await client.getStockQuote(symbol);
    if (!q.symbol) {
      return { content: [{ type: "text", text: `未找到 ${symbol} 的行情数据。` }] };
    }
    return { content: [{ type: "text", text: formatQuote(q) }] };
  }
);

server.tool(
  "get_batch_quotes",
  "批量获取多只股票的实时行情。一次可查询多只，适合对比和监控。",
  {
    symbols: z.string().describe("股票代码列表，逗号分隔，如 SH600519,SZ000001,AAPL"),
  },
  async ({ symbols }) => {
    const list = symbols.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) {
      return { content: [{ type: "text", text: "请提供至少一个股票代码。" }] };
    }
    const quotes = await client.getBatchQuotes(list);
    if (quotes.length === 0) {
      return { content: [{ type: "text", text: "未获取到行情数据。" }] };
    }
    const text = quotes.map(formatQuote).join("\n\n---\n\n");
    return { content: [{ type: "text", text: `${quotes.length} 只股票行情：\n\n${text}` }] };
  }
);

server.tool(
  "get_hot_stocks",
  "获取雪球热门股票排行榜。可按市场筛选：A股、港股、美股。",
  {
    market: z.enum(["A", "HK", "US"]).optional().default("A").describe("市场：A（A股）、HK（港股）、US（美股）"),
    count: z.number().optional().default(10).describe("数量，默认10"),
  },
  async ({ market, count }) => {
    const typeMap: Record<string, number> = { A: 10, HK: 13, US: 14 };
    const type = typeMap[market] ?? 10;
    const stocks = await client.getHotStocks(type, count);
    if (stocks.length === 0) {
      return { content: [{ type: "text", text: `暂无${market}热门股票数据。` }] };
    }
    const text = stocks
      .map((s, i) => {
        const parts: string[] = [`${i + 1}. ${s.name ?? s.symbol} (${s.symbol})`];
        if (s.current != null) {
          const pct = s.percent != null ? ` ${s.percent >= 0 ? "+" : ""}${s.percent.toFixed(2)}%` : "";
          parts.push(`  ${s.current}${pct}`);
        }
        if (s.value != null) parts.push(`  热度 ${s.value}`);
        if (s.followers_count != null) parts.push(`  关注 ${s.followers_count}`);
        if (s.tweet_count != null) parts.push(`  讨论 ${s.tweet_count}`);
        return parts.join("");
      })
      .join("\n");
    const marketLabel = { A: "A股", HK: "港股", US: "美股" }[market];
    return { content: [{ type: "text", text: `${marketLabel}热门股票 Top ${stocks.length}：\n\n${text}` }] };
  }
);

server.tool(
  "screen_stocks",
  "股票筛选器。可按涨跌幅、市值、PE、PB、换手率等条件排序筛选。",
  {
    market: z.enum(["CN", "US", "HK"]).optional().default("CN").describe("市场：CN（A股）、US（美股）、HK（港股）"),
    order_by: z.enum(["percent", "market_capital", "pe_ttm", "pb", "turnover_rate", "amount", "volume"]).optional().default("percent").describe("排序字段"),
    order: z.enum(["desc", "asc"]).optional().default("desc").describe("排序方向：desc（降序）、asc（升序）"),
    page: z.number().optional().default(1).describe("页码，默认1"),
    size: z.number().optional().default(10).describe("每页数量，默认10，最大30"),
  },
  async ({ market, order_by, order, page, size }) => {
    const result = await client.screenStocks({ market, order_by, order, page, size: Math.min(size, 30) });
    const stocks = result.stocks ?? [];
    if (stocks.length === 0) {
      return { content: [{ type: "text", text: "未筛选到符合条件的股票。" }] };
    }
    const text = stocks
      .map((s, i) => {
        const offset = (page - 1) * size;
        const parts: string[] = [`${offset + i + 1}. ${s.name ?? s.symbol} (${s.symbol})`];
        if (s.current !== undefined) {
          const pct = s.percent !== undefined ? ` ${s.percent >= 0 ? "+" : ""}${s.percent.toFixed(2)}%` : "";
          parts.push(`  ${s.current}${pct}`);
        }
        const metrics: string[] = [];
        if (s.market_capital !== undefined) metrics.push(`市值 ${(s.market_capital / 1e8).toFixed(0)}亿`);
        if (s.pe_ttm !== undefined && s.pe_ttm !== null) metrics.push(`PE ${s.pe_ttm.toFixed(1)}`);
        if (s.pb !== undefined && s.pb !== null) metrics.push(`PB ${s.pb.toFixed(1)}`);
        if (s.turnover_rate !== undefined) metrics.push(`换手 ${s.turnover_rate.toFixed(2)}%`);
        if (metrics.length > 0) parts.push(`  [${metrics.join(", ")}]`);
        return parts.join("");
      })
      .join("\n");
    const totalStr = result.total !== undefined ? `（共 ${result.total} 只）` : "";
    return { content: [{ type: "text", text: `筛选结果${totalStr}：\n\n${text}` }] };
  }
);

server.tool(
  "get_company_profile",
  "获取A股上市公司的基本信息，包括公司名称、法人、注册资本、主营业务、经营范围等。",
  {
    symbol: z.string().describe("A股股票代码，如 SH600519、SZ000001"),
  },
  async ({ symbol }) => {
    const info = await client.getCompanyProfile(symbol);
    if (!info.org_name && !info.short_name) {
      return { content: [{ type: "text", text: `未找到 ${symbol} 的公司信息。` }] };
    }
    const lines: string[] = [];
    if (info.org_name) lines.push(`公司全称: ${info.org_name}`);
    if (info.short_name) lines.push(`简称: ${info.short_name}`);
    if (info.chairman) lines.push(`董事长: ${info.chairman}`);
    if (info.general_manager) lines.push(`总经理: ${info.general_manager}`);
    if (info.secretary) lines.push(`董秘: ${info.secretary}`);
    if (info.established_date) {
      const d = /^\d+$/.test(info.established_date) ? formatDate(Number(info.established_date)) : info.established_date;
      lines.push(`成立日期: ${d}`);
    }
    if (info.reg_capital) lines.push(`注册资本: ${info.reg_capital} ${info.reg_price_unit ?? ""}`);
    if (info.address) lines.push(`地址: ${info.address}`);
    if (info.main_operation_business) lines.push(`主营业务: ${info.main_operation_business}`);
    if (info.scope) lines.push(`经营范围: ${info.scope.slice(0, 500)}`);
    if (info.desc) lines.push(`简介: ${info.desc.slice(0, 500)}`);
    return { content: [{ type: "text", text: `${symbol} 公司信息：\n\n${lines.join("\n")}` }] };
  }
);

server.tool(
  "get_stock_dividend",
  "获取A股上市公司的历史分红送转记录。",
  {
    symbol: z.string().describe("A股股票代码，如 SH600519"),
  },
  async ({ symbol }) => {
    const items = await client.getStockDividend(symbol);
    if (items.length === 0) {
      return { content: [{ type: "text", text: `${symbol} 暂无分红记录。` }] };
    }
    const text = items
      .map((d) => {
        const parts: string[] = [d.dividend_year ?? d.bonus_year ?? "未知年度"];
        if (d.plan_explain) {
          parts.push(d.plan_explain);
        } else {
          if (d.bonus_type) parts.push(d.bonus_type);
          if (d.bonus_cash != null && d.bonus_cash > 0) parts.push(`每10股派 ${d.bonus_cash} 元`);
          if (d.bonus_shares != null && d.bonus_shares > 0) parts.push(`每10股送 ${d.bonus_shares} 股`);
          if (d.bonus_capitalization != null && d.bonus_capitalization > 0) parts.push(`每10股转增 ${d.bonus_capitalization} 股`);
        }
        const exDate = d.ashare_ex_dividend_date ?? d.ex_dividend_date;
        if (exDate) {
          const dateStr = typeof exDate === "number" ? formatDate(exDate) : exDate;
          parts.push(`除权除息日: ${dateStr}`);
        }
        return parts.join("  ");
      })
      .join("\n");
    return { content: [{ type: "text", text: `${symbol} 分红历史（${items.length} 条）：\n\n${text}` }] };
  }
);

server.tool(
  "get_stock_industry",
  "获取某只A股股票所属的行业和概念板块标签。",
  {
    symbol: z.string().describe("A股股票代码，如 SH600519"),
  },
  async ({ symbol }) => {
    const result = await client.getStockIndustry(symbol);
    const industries = result.industries ?? [];
    if (industries.length === 0) {
      return { content: [{ type: "text", text: `${symbol} 暂无行业标签。` }] };
    }
    const text = industries.map((i) => `${i.name}${i.code ? ` (${i.code})` : ""}`).join("、");
    return { content: [{ type: "text", text: `${symbol} 所属行业/概念：${text}` }] };
  }
);

server.tool(
  "get_industry_list",
  "获取行业板块列表及涨跌数据，可查看各行业的实时涨跌幅。",
  {
    level: z.number().optional().default(1).describe("行业级别，1=一级行业，2=二级行业，默认1"),
  },
  async ({ level }) => {
    const list = await client.getIndustryList(level);
    if (list.length === 0) {
      return { content: [{ type: "text", text: "暂无行业数据。" }] };
    }
    const text = list
      .map((item) => {
        const pct = item.percent !== undefined
          ? `${item.percent >= 0 ? "+" : ""}${item.percent.toFixed(2)}%`
          : "";
        return `${item.name}${item.code ? ` (${item.code})` : ""}  ${pct}`;
      })
      .join("\n");
    return { content: [{ type: "text", text: `行业板块列表（${list.length} 个）：\n\n${text}` }] };
  }
);

// ═══════════════════════════════════════════════════════════════════
//  自选股管理
// ═══════════════════════════════════════════════════════════════════

server.tool(
  "get_watchlists",
  "获取当前登录用户的自选股分组列表，包含股票、关注（组合）、基金等所有分类。",
  {},
  async () => {
    const groups = await client.getWatchlists();
    if (groups.length === 0) {
      return { content: [{ type: "text", text: "暂无自选股分组。" }] };
    }
    const text = groups
      .map((g) => `${g.pname} (pid=${g.pid}, ${g.stock_count ?? 0}只)`)
      .join("\n");
    return {
      content: [{ type: "text", text: `自选股分组（${groups.length} 个）：\n\n${text}` }],
    };
  }
);

server.tool(
  "get_watchlist_stocks",
  "获取某个自选股分组下的所有股票列表，返回股票代码和名称。支持查看他人自选股（传入 user_id）。建议先用 get_user_watchlists 获取分组 pid。",
  {
    pid: z.number().describe("分组ID。常用：-1=全部，-5=沪深，-7=港股，-6=美股。可从 get_watchlists / get_user_watchlists 获取"),
    category: z.number().optional().default(0).describe("分类：0=全部，1=组合，2=股票。默认0即可"),
    user_id: z.string().optional().describe("可选，指定查看哪个用户的自选股（用户ID，纯数字）。不传则查看自己的"),
  },
  async ({ pid, category, user_id }) => {
    const result = await client.getWatchlistStocks(pid, category, -1, user_id);
    const stocks = result.stocks ?? [];
    if (stocks.length === 0) {
      return { content: [{ type: "text", text: "该分组下暂无自选股。" }] };
    }
    const text = stocks
      .map((s) => {
        const typeLabel = s.stockType === 12 ? "指数" : s.stockType === 0 ? "组合" : "股票";
        return `${s.stockName ?? s.code} (${s.code})  [${typeLabel}]`;
      })
      .join("\n");
    const whoStr = user_id ? `用户 ${user_id} 的` : "我的";
    return {
      content: [{ type: "text", text: `${whoStr}自选股列表（${stocks.length} 只）：\n\n${text}` }],
    };
  }
);

server.tool(
  "get_user_watchlists",
  "获取任意雪球用户的自选股分组列表（文件夹结构和数量统计）。配合 get_watchlist_stocks 可查看该用户的自选股详情。",
  {
    user_id: z.string().describe("雪球用户ID（纯数字），可从用户主页URL获取"),
  },
  async ({ user_id }) => {
    const result = await client.getUserWatchlistFolders(user_id);
    const sections: string[] = [];

    if (result.stocks.length > 0) {
      const items = result.stocks
        .map((g) => `  ${g.pname} (pid=${g.pid}, ${g.stock_count}只)`)
        .join("\n");
      sections.push(`【股票分组】\n${items}`);
    }
    if (result.cubes.length > 0) {
      const items = result.cubes
        .map((g) => `  ${g.pname} (pid=${g.pid}, ${g.stock_count}只)`)
        .join("\n");
      sections.push(`【关注/组合】\n${items}`);
    }
    if (result.funds.length > 0) {
      const items = result.funds
        .map((g) => `  ${g.pname} (pid=${g.pid}, ${g.stock_count}只)`)
        .join("\n");
      sections.push(`【基金】\n${items}`);
    }

    if (sections.length === 0) {
      return { content: [{ type: "text", text: `用户 ${user_id} 暂无自选股分组数据（可能未公开）。` }] };
    }
    return {
      content: [{ type: "text", text: `用户 ${user_id} 的自选股分组：\n\n${sections.join("\n\n")}` }],
    };
  }
);

server.tool(
  "add_to_watchlist",
  "添加股票到自选股分组。",
  {
    pid: z.number().describe("分组ID，可从 get_watchlists 获取"),
    symbols: z.string().describe("股票代码，逗号分隔，如 SH600519,SZ000001"),
  },
  async ({ pid, symbols }) => {
    const list = symbols.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) {
      return { content: [{ type: "text", text: "请提供至少一个股票代码。" }] };
    }
    const ok = await client.addToWatchlist(pid, list);
    return {
      content: [{ type: "text", text: ok ? `已成功添加 ${list.join(", ")} 到分组 ${pid}。` : `添加失败，请检查分组ID和股票代码。` }],
    };
  }
);

server.tool(
  "remove_from_watchlist",
  "从自选股列表中彻底删除股票（所有分组中都会被移除）。",
  {
    symbols: z.string().describe("股票代码，逗号分隔，如 SH600519,SZ000001"),
  },
  async ({ symbols }) => {
    const list = symbols.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) {
      return { content: [{ type: "text", text: "请提供至少一个股票代码。" }] };
    }
    const ok = await client.removeFromWatchlist(list);
    return {
      content: [{ type: "text", text: ok ? `已成功删除 ${list.join(", ")}。` : `删除失败，请检查股票代码。` }],
    };
  }
);

server.tool(
  "create_watchlist",
  "创建新的自选股分组。",
  {
    name: z.string().describe("分组名称"),
  },
  async ({ name }) => {
    const result = await client.createWatchlist(name);
    if (result) {
      return { content: [{ type: "text", text: `分组「${name}」创建成功！pid=${result.pid}` }] };
    }
    return { content: [{ type: "text", text: "创建分组失败。" }] };
  }
);

server.tool(
  "delete_watchlist",
  "删除一个自选股分组。",
  {
    pid: z.number().describe("分组ID，可从 get_watchlists 获取"),
  },
  async ({ pid }) => {
    const ok = await client.deleteWatchlist(pid);
    return {
      content: [{ type: "text", text: ok ? `分组 ${pid} 已删除。` : `删除失败，请检查分组ID。` }],
    };
  }
);

// ═══════════════════════════════════════════════════════════════════
//  组合追踪（查看别人的组合和持仓）
// ═══════════════════════════════════════════════════════════════════

server.tool(
  "get_user_cubes",
  "获取某个雪球用户创建的投资组合列表。可看到组合名称、代码、收益率、关注人数等。",
  {
    user_id: z.string().describe("雪球用户ID（纯数字），可从用户主页URL获取"),
    page: z.number().optional().default(1).describe("页码，默认1"),
    count: z.number().optional().default(20).describe("每页数量，默认20"),
  },
  async ({ user_id, page, count }) => {
    const result = await client.getUserCubes(user_id, page, count);
    const cubes = result.cubes ?? [];
    if (cubes.length === 0) {
      return { content: [{ type: "text", text: `用户 ${user_id} 暂无公开组合。` }] };
    }
    const text = cubes
      .map((c) => {
        const lines: string[] = [];
        lines.push(`${c.name ?? "未命名"} (${c.symbol ?? "?"})`);
        if (c.description) lines.push(`描述: ${c.description}`);
        if (c.market) lines.push(`市场: ${c.market}`);
        const gains: string[] = [];
        if (c.total_gain != null) gains.push(`总收益: ${c.total_gain.toFixed(2)}%`);
        if (c.annualized_gain_rate != null) gains.push(`年化: ${c.annualized_gain_rate.toFixed(2)}%`);
        if (c.daily_gain != null) gains.push(`今日: ${c.daily_gain.toFixed(2)}%`);
        if (c.monthly_gain != null) gains.push(`近一月: ${c.monthly_gain.toFixed(2)}%`);
        if (gains.length > 0) lines.push(gains.join("  "));
        if (c.net_value != null) lines.push(`净值: ${c.net_value.toFixed(4)}`);
        if (c.follower_count != null) lines.push(`关注人数: ${c.follower_count}`);
        if (c.star != null) lines.push(`星级: ${c.star}`);
        return lines.join("\n");
      })
      .join("\n\n---\n\n");
    const totalStr = result.total != null ? `（共 ${result.total} 个）` : "";
    return {
      content: [{ type: "text", text: `用户 ${user_id} 的组合列表${totalStr}：\n\n${text}` }],
    };
  }
);

server.tool(
  "get_cube_holdings",
  "获取某个雪球组合的当前持仓详情，包括每只股票的名称、代码、仓位占比等。",
  {
    cube_symbol: z.string().describe("组合代码，如 ZH2001629，可从 get_user_cubes 获取"),
  },
  async ({ cube_symbol }) => {
    const result = await client.getCubeHoldings(cube_symbol);
    const holdings = result.holdings ?? [];
    if (holdings.length === 0) {
      return { content: [{ type: "text", text: `组合 ${cube_symbol} 暂无持仓数据。` }] };
    }
    const text = holdings
      .map((h) => {
        const parts: string[] = [];
        parts.push(`${h.stock_name ?? "未知"} (${h.stock_symbol ?? "?"})`);
        if (h.weight != null) parts.push(`仓位: ${h.weight.toFixed(2)}%`);
        if (h.segment_name) parts.push(`分类: ${h.segment_name}`);
        if (h.volume != null) parts.push(`持仓量: ${h.volume}`);
        return parts.join("  ");
      })
      .join("\n");
    const cashStr = result.cash != null ? `\n现金比例: ${result.cash.toFixed(2)}%` : "";
    const timeStr = result.last_rebalancing_time
      ? `\n最后调仓时间: ${formatDate(result.last_rebalancing_time)}`
      : "";
    return {
      content: [{ type: "text", text: `组合 ${cube_symbol} 当前持仓（${holdings.length} 只）：\n\n${text}${cashStr}${timeStr}` }],
    };
  }
);

// ─── Start Server ──────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("雪球 MCP Server v2 已启动 (stdio 模式)");
}

main().catch((err) => {
  console.error("启动失败:", err);
  process.exit(1);
});
