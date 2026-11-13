# WallpaperSearch

Wallpaper Engine Workshop 搜索工具。Steam Cookie 会从 GitHub 仓库拉取加密文件，
使用 AES-256-GCM 解密，并在进程内缓存 30 分钟。

## 配置

复制 `.env.example` 为 `.env.local`，然后配置。实际配置文件已被 Git 忽略：

| 变量 | 说明 |
| --- | --- |
| `COOKIE_ENCRYPT_KEY` | Cookie 加密文件的解密密钥，必填 |
| `COOKIE_REPO_OWNER` | GitHub 仓库所有者，默认 `QSlotus` |
| `COOKIE_REPO_NAME` | GitHub 仓库名，默认 `auto-we` |
| `COOKIE_FILE_PATH` | 加密 Cookie 文件路径，默认 `cookie.enc.json` |
| `INVITE_CODE` | Mature 内容邀请码，留空则 Mature 搜索完全关闭 |
| `PORT` | HTTP 服务端口，默认 `3000` |
| `UPSTREAM_TIMEOUT_MS` | 上游请求超时，默认 `15000` |
| `SEARCH_CACHE_TTL_MS` | 搜索结果进程内缓存，默认 `300000`（5 分钟） |
| `ITEM_CACHE_TTL_MS` | 详情页进程内缓存，默认 `600000`（10 分钟） |
| `DISPLAY_TZ_OFFSET_HOURS` | 页面时间展示时区偏移，默认 `8`（北京时间） |
| `ALLOW_INSECURE_TLS` | 仅本机调试用。设为 `1` 才关闭证书校验，生产环境不要开 |

加密文件兼容参考项目使用的两种格式：

- v1：`encrypted_cookie`
- v2：`encrypted_cookies.steamLoginSecure` 和可选的 `encrypted_cookies.sessionid`

服务仅在内存中保存解密结果，不会把 Cookie 明文写回磁盘。

## 上游页面结构

搜索结果**不再解析 HTML 类名**，而是读取 Steam 内嵌的 SSR 数据。Steam 目前同时存在两种投放方式，
`lib/steamSsrParser.js` 两种都支持，并按顺序尝试：

1. `<script id="valve-ssr-data" type="application/json">` 整包 JSON（2025 年末改版后的形态），
   数据路径为 `renderContext.queryData` → `queries[].queryKey[0] === 'workshop_browse'` → `state.data.results`
2. `window.SSR.renderContext = JSON.parse("...")` 内联赋值（改版前的形态）
3. 最后才回退到旧版 `.workshopItem` DOM 解析（Steam 改版后已不再输出，仅作兼容）

如果三种方式都拿不到数据，页面会显示明确的错误提示，并在日志里打印
`[Parser] ... (bytes=..., valveSsrData=..., legacySsr=...)`，便于判断是上游改版还是网络故障。

## 缓存

- 搜索结果：进程内 5 分钟，同时下发 `Cache-Control: public, max-age=300`
- 详情页：进程内 10 分钟，同时下发 `Cache-Control: public, max-age=600`
- Mature 搜索与所有错误页一律 `private, no-store`，避免受限内容被公共缓存下发

注意进程内缓存不跨 Serverless 实例共享，只对同一热实例的重复请求生效。

## 本地运行

```bash
npm install
npm start
```

## 测试

```bash
npm test
```

## 部署到 Vercel

项目包含 `api/index.js` Serverless 入口和 `vercel.json` 路由配置。先在 Vercel
项目设置中添加 `COOKIE_ENCRYPT_KEY` 和 `INVITE_CODE`，其他 Cookie 仓库变量按需覆盖默认值，然后部署：

```bash
vercel --prod
```

`.env.local` 不会被提交或上传到 Vercel。
