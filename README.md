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
| `INVITE_CODE` | Mature 内容邀请码 |
| `PORT` | HTTP 服务端口，默认 `3000` |

加密文件兼容参考项目使用的两种格式：

- v1：`encrypted_cookie`
- v2：`encrypted_cookies.steamLoginSecure` 和可选的 `encrypted_cookies.sessionid`

服务仅在内存中保存解密结果，不会把 Cookie 明文写回磁盘。

## 本地运行

```bash
npm install
npm start
```

## 部署到 Vercel

项目包含 `api/index.js` Serverless 入口和 `vercel.json` 路由配置。先在 Vercel
项目设置中添加 `COOKIE_ENCRYPT_KEY` 和 `INVITE_CODE`，其他 Cookie 仓库变量按需覆盖默认值，然后部署：

```bash
vercel --prod
```

`.env.local` 不会被提交或上传到 Vercel。
