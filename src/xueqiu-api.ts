/**
 * Xueqiu API Client (v2)
 *
 * Token 通过环境变量 XUEQIU_TOKEN 配置；匿名 token 仅保存在内存中。
 *
 * Domains:
 *  - api.xueqiu.com     → 社交 API（无 WAF）
 *  - stock.xueqiu.com   → 股票数据 API
 *  - xueqiu.com         → 用户搜索、关注列表（需要登录 token）
 */

const API_BASE = "https://api.xueqiu.com";
const MAIN_BASE = "https://xueqiu.com";
const STOCK_BASE = "https://stock.xueqiu.com/v5/stock";
const REQUEST_TIMEOUT_MS = 15_000;

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Origin: "https://xueqiu.com",
  Referer: "https://xueqiu.com/",
  "X-Requested-With": "XMLHttpRequest",
};

// ─── Interfaces ────────────────────────────────────────────────────

export interface XueqiuUser {
  id: number;
  screen_name: string;
  description: string;
  followers_count: number;
  friends_count: number;
  status_count: number;
  verified: boolean;
  verified_description?: string;
  gender?: string;
  province?: number;
  city?: number;
  profile_image_url?: string;
}

export interface XueqiuPost {
  id: number;
  user?: XueqiuUser;
  user_id?: number;
  created_at: string | number;
  text?: string;
  description?: string;
  target?: string;
  title?: string;
  view_count?: number;
  reply_count?: number;
  comment_count?: number;
  retweet_count?: number;
  like_count?: number;
  fav_count?: number;
  retweeted_status?: XueqiuPost;
  data?: string;
  source?: string;
}

export interface XueqiuComment {
  id: number;
  user?: XueqiuUser;
  user_id?: number;
  created_at: string | number;
  text: string;
  description?: string;
  reply_count?: number;
  like_count?: number;
}

export interface StockQuote {
  symbol: string;
  current?: number;
  percent?: number;
  chg?: number;
  volume?: number;
  amount?: number;
  market_capital?: number;
  turnover_rate?: number;
  pe_ttm?: number;
  pe_forecast?: number;
  pb?: number;
  ps?: number;
  pcf?: number;
  dividend_yield?: number;
  dividend?: number;
  eps?: number;
  nav_ps?: number;
  total_shares?: number;
  float_shares?: number;
  free_float_shares?: number;
  high?: number;
  low?: number;
  open?: number;
  last_close?: number;
  avg_price?: number;
  timestamp?: number;
  name?: string;
  exchange?: string;
  currency?: string;
  [key: string]: unknown;
}

export interface HotStock {
  symbol: string;
  name?: string;
  current?: number;
  percent?: number;
  chg?: number;
  volume?: number;
  amount?: number;
  market_capital?: number;
  followers_count?: number;
  tweet_count?: number;
  rank?: number;
  [key: string]: unknown;
}

export interface ScreenedStock {
  symbol: string;
  name?: string;
  current?: number;
  percent?: number;
  pe_ttm?: number;
  pb?: number;
  market_capital?: number;
  volume?: number;
  amount?: number;
  turnover_rate?: number;
  [key: string]: unknown;
}

export interface Watchlist {
  pid: number;
  pname: string;
  stock_count?: number;
  category?: number;
  type?: number;
  created_at?: number;
}

export interface WatchlistStock {
  code: string;
  stockName?: string;
  exchange?: string;
  stockType?: number;
  comment?: string;
  sellPrice?: number;
  buyPrice?: number;
  targetPercent?: number;
  isNotice?: number;
  [key: string]: unknown;
}

export interface CompanyInfo {
  org_name?: string;
  short_name?: string;
  chairman?: string;
  legal_representative?: string;
  general_manager?: string;
  secretary?: string;
  established_date?: string;
  reg_price_unit?: string;
  reg_capital?: string;
  inst_number?: number;
  inst_price?: number;
  main_operation_business?: string;
  scope?: string;
  address?: string;
  desc?: string;
  [key: string]: unknown;
}

export interface DividendItem {
  dividend_year?: string;
  bonus_year?: string;
  plan_explain?: string;
  bonus_type?: string;
  bonus_cash?: number;
  bonus_shares?: number;
  bonus_capitalization?: number;
  ashare_ex_dividend_date?: number | string;
  ex_dividend_date?: string;
  equity_date?: number | string;
  record_date?: string;
  pay_date?: string;
  [key: string]: unknown;
}

export interface CubeInfo {
  id?: number;
  name?: string;
  symbol?: string;
  description?: string;
  active_flag?: boolean;
  star?: number;
  market?: string;
  owner_id?: number;
  total_gain?: number;
  net_value?: number;
  annualized_gain_rate?: number;
  follower_count?: number;
  daily_gain?: number;
  monthly_gain?: number;
  [key: string]: unknown;
}

export interface CubeHolding {
  stock_id?: number;
  stock_name?: string;
  stock_symbol?: string;
  weight?: number;
  segment_name?: string;
  segment_id?: number;
  segment_color?: string;
  proactive?: boolean;
  volume?: number;
  [key: string]: unknown;
}

// ─── Client ────────────────────────────────────────────────────────

export class XueqiuClient {
  private token: string;
  private tokenExpiry: number = 0;
  private tokenSource: "env" | "anonymous" | "none" = "none";

  constructor() {
    const envToken = process.env.XUEQIU_TOKEN?.trim();
    if (envToken) {
      this.token = envToken.trim();
      this.tokenSource = "env";
    } else {
      this.token = "";
    }
    this.tokenExpiry = Date.now() + 24 * 60 * 60 * 1000;
  }

  get isAuthenticated(): boolean {
    return this.tokenSource === "env" && this.token.length > 0;
  }

  private requireLogin(action: string): void {
    if (!this.isAuthenticated) {
      throw new Error(`${action} 需要配置有效的 XUEQIU_TOKEN。匿名 token 不支持该操作。`);
    }
  }

  /** Build cookie string for API requests */
  private async buildCookieString(): Promise<string> {
    if (this.tokenSource === "env") {
      return `xq_a_token=${this.token}`;
    }
    if (!this.token || Date.now() >= this.tokenExpiry) {
      await this.fetchToken();
    }
    return `xq_a_token=${this.token}`;
  }

  /** Fetch a fresh anonymous xq_a_token from xueqiu.com */
  private async fetchToken(): Promise<void> {
    const res = await fetch(`${MAIN_BASE}/about`, {
      method: "GET",
      headers: { "User-Agent": DEFAULT_HEADERS["User-Agent"] },
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const setCookieHeaders = res.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookieHeaders) {
      const kv = cookie.split(";")[0];
      const match = kv.match(/xq_a_token=(.+)/);
      if (match) {
        this.token = match[1];
        this.tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
        this.tokenSource = "anonymous";
        return;
      }
    }

    // Fallback: try single set-cookie header
    const cookieHeader = res.headers.get("set-cookie") ?? "";
    const match = cookieHeader.match(/xq_a_token=([^;]+)/);
    if (match) {
      this.token = match[1];
      this.tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
      this.tokenSource = "anonymous";
      return;
    }

    throw new Error("无法获取雪球 token，请检查网络连接或设置 XUEQIU_TOKEN 环境变量。");
  }

  // ─── HTTP Helpers ──────────────────────────────────────────────

  /** GET request to api.xueqiu.com / main domain / stock domain */
  private async get<T = unknown>(
    path: string,
    params: Record<string, string | number | undefined> = {},
    domain: "api" | "main" | "stock" = "api"
  ): Promise<T> {
    const cookieString = await this.buildCookieString();
    const base =
      domain === "main" ? MAIN_BASE :
      domain === "stock" ? STOCK_BASE :
      API_BASE;

    const url = new URL(path.startsWith("http") ? path : `${base}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        ...DEFAULT_HEADERS,
        Cookie: cookieString,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`雪球 API 请求失败 [${res.status}]: ${text.slice(0, 500)}`);
    }

    const text = await res.text();
    if (!text || text.trim() === "") return {} as T;

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`雪球 API 返回了非 JSON 数据: ${text.slice(0, 300)}`);
    }
  }

  /** POST request */
  private async post<T = unknown>(
    path: string,
    body: Record<string, string | number>,
    domain: "api" | "main" | "stock" = "stock"
  ): Promise<T> {
    const cookieString = await this.buildCookieString();
    const base =
      domain === "main" ? MAIN_BASE :
      domain === "stock" ? STOCK_BASE :
      API_BASE;

    const url = new URL(`${base}${path}`);
    const formBody = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      formBody.set(key, String(value));
    }

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        ...DEFAULT_HEADERS,
        Cookie: cookieString,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody.toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`雪球 API POST 失败 [${res.status}]: ${text.slice(0, 500)}`);
    }

    const text = await res.text();
    if (!text || text.trim() === "") return {} as T;

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`雪球 API 返回了非 JSON 数据: ${text.slice(0, 300)}`);
    }
  }

  // ─── User APIs ───────────────────────────────────────────────

  async searchUsers(query: string, page = 1, count = 10): Promise<{ users: XueqiuUser[] }> {
    return this.get<{ users: XueqiuUser[] }>("/users/search.json", { q: query, page, count }, "main");
  }

  async getUserProfile(userId: string | number): Promise<XueqiuUser> {
    return this.get<XueqiuUser>("/user/show.json", { id: userId }, "main");
  }

  async getCurrentUser(): Promise<XueqiuUser> {
    this.requireLogin("获取当前登录用户信息");
    return this.get<XueqiuUser>("/user/show.json", {}, "main");
  }

  async getFollowing(
    userId: string | number,
    page = 1,
    gid = 0
  ): Promise<{ users: XueqiuUser[]; maxPage?: number; count?: number }> {
    return this.get("/friendships/groups/members.json", { uid: userId, page, gid });
  }

  // ─── Post / Article APIs ─────────────────────────────────────

  async getUserPosts(
    userId: string | number,
    page = 1,
    count = 10
  ): Promise<{ statuses: XueqiuPost[] }> {
    const res = await this.get<{ statuses?: XueqiuPost[]; list?: XueqiuPost[] }>(
      "/v4/statuses/user_timeline.json",
      { user_id: userId, page, count }
    );
    return { statuses: res.statuses ?? res.list ?? [] };
  }

  async getUserArticles(
    userId: string | number,
    page = 1,
    count = 10
  ): Promise<{ statuses: XueqiuPost[]; total?: number; maxPage?: number }> {
    const res = await this.get<{ list?: XueqiuPost[]; statuses?: XueqiuPost[]; total?: number; maxPage?: number }>(
      "/statuses/original/timeline.json",
      { user_id: userId, page, count }
    );
    return {
      statuses: res.list ?? res.statuses ?? [],
      total: res.total,
      maxPage: res.maxPage,
    };
  }

  async getPostDetail(postId: string | number): Promise<XueqiuPost> {
    return this.get<XueqiuPost>("/statuses/show.json", { id: postId });
  }

  async getPostComments(
    postId: string | number,
    page = 1,
    count = 20,
    asc = false
  ): Promise<{ comments: XueqiuComment[] }> {
    const res = await this.get<{ comments?: XueqiuComment[] }>(
      "/statuses/comments.json",
      { id: postId, page, count, asc: asc ? "true" : "false" }
    );
    return { comments: res.comments ?? [] };
  }

  async getHotPosts(
    scope: "day" | "week" | "month" = "day",
    count = 10,
    page = 1
  ): Promise<XueqiuPost[]> {
    const res = await this.get<XueqiuPost[] | { list?: XueqiuPost[] }>(
      "/statuses/hots.json",
      { a: "1", count, page, scope, type: "status", meigu: "0" }
    );
    return Array.isArray(res) ? res : (res.list ?? []);
  }

  async getStockKOL(
    symbol: string,
    start = 0,
    count = 10
  ): Promise<{ users: XueqiuUser[] }> {
    const res = await this.get<XueqiuUser[] | { users: XueqiuUser[] }>(
      "/recommend/user/stock_hot_user.json",
      { symbol, start, count }
    );
    if (Array.isArray(res)) return { users: res };
    return { users: res.users ?? [] };
  }

  async getNewsFeed(
    category: number = -1,
    count = 10,
    sinceId = -1,
    maxId = -1
  ): Promise<{ list: XueqiuPost[]; next_max_id?: number }> {
    return this.get("/v4/statuses/public_timeline_by_category.json", {
      category, count, since_id: sinceId, max_id: maxId,
    });
  }

  async getLiveNews(
    count = 20,
    sinceId = -1,
    maxId = -1
  ): Promise<{ items: Array<{ id: number; text: string; created_at: string | number }> }> {
    return this.get("/statuses/livenews/list.json", {
      count, since_id: sinceId, max_id: maxId,
    });
  }

  async getUserFavorites(
    userId: string | number,
    page = 1,
    size = 20
  ): Promise<{ favorites: XueqiuPost[] }> {
    const res = await this.get<{ favorites?: XueqiuPost[]; list?: XueqiuPost[] }>(
      "/favorites.json",
      { userid: userId, page, size }
    );
    return { favorites: res.favorites ?? res.list ?? [] };
  }

  // ─── Cube (组合) APIs ──────────────────────────────────────

  /** 获取某用户的组合列表 */
  async getUserCubes(
    userId: string | number,
    page = 1,
    count = 20
  ): Promise<{ cubes: CubeInfo[]; total?: number }> {
    const res = await this.get<{
      list?: CubeInfo[];
      totalCount?: number;
      count?: number;
    }>(
      "/cubes/list.json",
      { user_id: userId, page, count },
      "main"
    );
    return { cubes: res.list ?? [], total: res.totalCount };
  }

  /** 获取组合的当前持仓 */
  async getCubeHoldings(
    cubeSymbol: string
  ): Promise<{ holdings: CubeHolding[]; cash?: number; last_rebalancing_time?: number }> {
    const res = await this.get<{
      last_rb?: {
        holdings?: CubeHolding[];
        cash?: number;
        created_at?: number;
      };
    }>(
      "/cubes/rebalancing/current.json",
      { cube_symbol: cubeSymbol },
      "main"
    );
    return {
      holdings: res.last_rb?.holdings ?? [],
      cash: res.last_rb?.cash,
      last_rebalancing_time: res.last_rb?.created_at,
    };
  }

  // ─── Stock Data APIs (stock.xueqiu.com) ──────────────────────

  /** 获取单只股票详细行情（含 PE/PB/股息率等） */
  async getStockQuote(symbol: string): Promise<StockQuote> {
    const res = await this.get<{ data?: { quote?: StockQuote } }>(
      "/quote.json",
      { symbol, extend: "detail" },
      "stock"
    );
    return res.data?.quote ?? (res as unknown as StockQuote);
  }

  /** 批量获取多只股票行情 */
  async getBatchQuotes(symbols: string[]): Promise<StockQuote[]> {
    const res = await this.get<{ data?: { items?: Array<{ quote?: StockQuote }> } }>(
      "/batch/quote.json",
      { symbol: symbols.join(",") },
      "stock"
    );
    const items = res.data?.items ?? [];
    return items.map((i) => i.quote ?? (i as unknown as StockQuote));
  }

  /** 获取公司简介 */
  async getCompanyProfile(symbol: string): Promise<CompanyInfo> {
    const res = await this.get<{ data?: { company?: Record<string, unknown> } }>(
      "/f10/cn/company.json",
      { symbol },
      "stock"
    );
    const co = res.data?.company;
    if (!co) return {};
    return {
      org_name: (co.org_name_cn ?? co.org_name ?? co.short_name) as string | undefined,
      short_name: (co.org_short_name_cn ?? co.short_name) as string | undefined,
      chairman: (co.chairman ?? co.legal_representative) as string | undefined,
      legal_representative: co.legal_representative as string | undefined,
      general_manager: co.general_manager as string | undefined,
      secretary: co.secretary as string | undefined,
      established_date: co.established_date as string | undefined,
      reg_capital: co.reg_capital as string | undefined,
      reg_price_unit: co.reg_price_unit as string | undefined,
      address: co.address as string | undefined,
      main_operation_business: (co.main_operation_business ?? co.operating_scope) as string | undefined,
      scope: co.operating_scope as string | undefined,
      desc: (co.org_cn_introduction ?? co.desc) as string | undefined,
    };
  }

  /** 获取分红历史 */
  async getStockDividend(symbol: string): Promise<DividendItem[]> {
    const res = await this.get<{ data?: { list?: DividendItem[]; items?: DividendItem[]; addtions?: DividendItem[]; allots?: unknown[] } }>(
      "/f10/cn/bonus.json",
      { symbol },
      "stock"
    );
    return res.data?.items ?? res.data?.list ?? res.data?.addtions ?? [];
  }

  /** 获取股票所属行业/概念标签 */
  async getStockIndustry(symbol: string): Promise<{ industries: Array<{ name: string; code?: string }> }> {
    const res = await this.get<{
      data?: {
        industry?: Array<{ ind_name?: string; ind_code?: string }>;
        concept?: Array<{ ind_name?: string; ind_code?: string }>;
        industry_list?: Array<{ name: string; code?: string }>;
      };
    }>(
      "/f10/cn/industry.json",
      { symbol },
      "stock"
    );
    // Merge industry and concept arrays
    const items: Array<{ name: string; code?: string }> = [];
    const indArr = res.data?.industry ?? [];
    const conArr = res.data?.concept ?? [];
    for (const i of indArr) {
      if (i.ind_name) items.push({ name: i.ind_name, code: i.ind_code });
    }
    for (const c of conArr) {
      if (c.ind_name) items.push({ name: c.ind_name, code: c.ind_code });
    }
    // Fallback to industry_list format
    if (items.length === 0 && res.data?.industry_list) {
      return { industries: res.data.industry_list };
    }
    return { industries: items };
  }

  /** 获取行业板块列表和涨跌数据 */
  async getIndustryList(level: number = 1): Promise<Array<{ name: string; code?: string; percent?: number; [key: string]: unknown }>> {
    const res = await this.get<{
      data?: { list?: Array<{ name: string; code?: string; percent?: number; [key: string]: unknown }> };
      industryList?: Array<{ indName?: string; indCode?: string; percent?: number; [key: string]: unknown }>;
    }>(
      "/stock/industry/list.json",
      { level, _: Date.now() },
      "api"
    );
    // API may return {industryList: [...]} or {data: {list: [...]}}
    if (res.industryList && Array.isArray(res.industryList)) {
      return res.industryList.map((item) => ({
        name: item.indName ?? "",
        code: item.indCode,
        percent: item.percent,
        ...item,
      }));
    }
    return res.data?.list ?? [];
  }

  /** 获取热门股票排行 */
  async getHotStocks(type: number = 10, count: number = 10): Promise<HotStock[]> {
    // type: 10=A股, 12=A股(另一种), 13=港股, 14=美股
    const res = await this.get<HotStock[] | { data?: { items?: HotStock[] } }>(
      "/hot_stock/list.json",
      { size: count, type, _type: 12 },
      "stock"
    );
    // API may return raw array or nested {data:{items:[...]}}
    if (Array.isArray(res)) return res;
    return res.data?.items ?? [];
  }

  /** 选股器 */
  async screenStocks(params: {
    page?: number;
    size?: number;
    order?: string;       // e.g. "desc"
    order_by?: string;    // e.g. "percent", "market_capital", "pe_ttm"
    market?: string;      // e.g. "CN", "US", "HK"
    exchange?: string;    // e.g. "SH", "SZ"
    industry?: string;
    [key: string]: string | number | undefined;
  } = {}): Promise<{ stocks: ScreenedStock[]; total?: number }> {
    const res = await this.get<{
      data?: {
        list?: ScreenedStock[];
        count?: number;
      };
    }>(
      "/screener/quote/list.json",
      {
        page: params.page ?? 1,
        size: params.size ?? 10,
        order: params.order ?? "desc",
        order_by: params.order_by ?? "percent",
        market: params.market ?? "CN",
        ...Object.fromEntries(
          Object.entries(params).filter(
            ([k]) => !["page", "size", "order", "order_by", "market"].includes(k)
          )
        ),
      },
      "stock"
    );
    return {
      stocks: res.data?.list ?? [],
      total: res.data?.count,
    };
  }

  // ─── Watchlist / Portfolio APIs ────────────────────────────────

  /** 获取自选股分组列表（包含所有分类：关注、股票、基金） */
  async getWatchlists(): Promise<Watchlist[]> {
    this.requireLogin("获取自己的自选股分组");
    const res = await this.get<{
      data?: {
        cubes?: Array<{ id: number; name: string; symbol_count?: number; category?: number; type?: number }>;
        stocks?: Array<{ id: number; name: string; symbol_count?: number; category?: number; type?: number }>;
        funds?: Array<{ id: number; name: string; symbol_count?: number; category?: number; type?: number }>;
        mutualFunds?: Array<{ id: number; name: string; symbol_count?: number; category?: number; type?: number }>;
      };
    }>(
      "/portfolio/list.json?system=true",
      {},
      "stock"
    );

    const all: Watchlist[] = [];
    const mapGroup = (
      items: Array<{ id: number; name: string; symbol_count?: number; category?: number; type?: number }> | undefined,
      label: string
    ) => {
      if (!items || !Array.isArray(items)) return;
      for (const c of items) {
        all.push({
          pid: c.id,
          pname: `[${label}] ${c.name}`,
          stock_count: c.symbol_count ?? 0,
          category: c.category,
          type: c.type,
        });
      }
    };

    mapGroup(res.data?.cubes, "关注");
    mapGroup(res.data?.stocks, "股票");
    mapGroup(res.data?.funds, "基金");
    mapGroup(res.data?.mutualFunds, "公募");

    return all;
  }

  /** 获取某个自选分组下的股票列表
   *  使用 /v4/stock/portfolio/stocks.json (api.xueqiu.com)
   *  关键：用 uid 参数可查看他人自选股（tuid 仅返回自己的） */
  async getWatchlistStocks(pid: number, category: number = 0, type: number = -1, userId?: string | number): Promise<{ stocks: WatchlistStock[] }> {
    if (!userId) this.requireLogin("查看自己的自选股");
    const uid = userId ?? (await this.getCurrentUser()).id;
    const res = await this.get<{ stocks?: WatchlistStock[] }>(
      "/v4/stock/portfolio/stocks.json",
      { pid, size: 1000, category, type, uid },
      "api"
    );
    return { stocks: res.stocks ?? [] };
  }

  /** 获取任意用户的自选股分组列表（文件夹结构 + 数量统计） */
  async getUserWatchlistFolders(userId: string | number): Promise<{
    stocks: Watchlist[];
    cubes: Watchlist[];
    funds: Watchlist[];
  }> {
    const res = await this.get<{
      data?: {
        cubes?: Array<{ id: number; name: string; symbol_count?: number; category?: number; type?: number }>;
        stocks?: Array<{ id: number; name: string; symbol_count?: number; category?: number; type?: number }>;
        funds?: Array<{ id: number; name: string; symbol_count?: number; category?: number; type?: number }>;
        mutualFunds?: Array<{ id: number; name: string; symbol_count?: number; category?: number; type?: number }>;
      };
    }>(
      "/portfolio/list.json",
      { system: "true", uid: userId },
      "stock"
    );

    const mapItems = (
      items: Array<{ id: number; name: string; symbol_count?: number; category?: number; type?: number }> | undefined,
    ): Watchlist[] => {
      if (!items || !Array.isArray(items)) return [];
      return items.map((c) => ({
        pid: c.id,
        pname: c.name,
        stock_count: c.symbol_count ?? 0,
        category: c.category,
        type: c.type,
      }));
    };

    return {
      stocks: mapItems(res.data?.stocks),
      cubes: mapItems(res.data?.cubes),
      funds: [...mapItems(res.data?.funds), ...mapItems(res.data?.mutualFunds)],
    };
  }

  /** 添加股票到自选分组 */
  async addToWatchlist(pid: number, symbols: string[]): Promise<boolean> {
    this.requireLogin("添加自选股");
    const res = await this.post<{ data?: boolean }>(
      "/portfolio/stock/add.json",
      { pid, symbols: symbols.join(",") },
      "stock"
    );
    return res.data === true || (res.data as unknown as number) === 1;
  }

  /** 从自选中彻底删除股票 */
  async removeFromWatchlist(symbols: string[]): Promise<boolean> {
    this.requireLogin("删除自选股");
    const res = await this.post<{ data?: boolean }>(
      "/service/v5/stock/portfolio/stock/cancel",
      { symbols: symbols.join(",") },
      "main"
    );
    return res.data === true;
  }

  /** 创建新的自选分组 */
  async createWatchlist(name: string): Promise<Watchlist | null> {
    this.requireLogin("创建自选分组");
    const res = await this.post<{ data?: Watchlist }>(
      "/portfolio/create.json",
      { pnames: name, category: 1 },
      "stock"
    );
    return res.data ?? null;
  }

  /** 删除自选分组 */
  async deleteWatchlist(pid: number): Promise<boolean> {
    this.requireLogin("删除自选分组");
    const res = await this.post<{ data?: boolean }>(
      "/portfolio/delete.json",
      { pid },
      "stock"
    );
    return res.data === true || (res.data as unknown as number) === 1;
  }
}
