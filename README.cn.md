# MindRails Frontend

![Next.js 16](https://img.shields.io/badge/Next.js-16-171717) ![React 19](https://img.shields.io/badge/React-19-087ea4) ![Node.js 24](https://img.shields.io/badge/Node.js-24-417e38) ![pnpm 11](https://img.shields.io/badge/pnpm-11-925e09)

[English](README.md)

MindRails 的 Next.js 和 React 网页客户端。团队成员在工作区中运行 Agent 会话、使用文档并查看交付物。部署步骤见[后端 README](https://github.com/patternrails/mindrails-backend/blob/main/README.cn.md)，功能与截图见[产品介绍](https://github.com/patternrails/mindrails-backend/blob/main/Introduction.cn.md)。

## 本地开发

使用 Node.js 24.18.1 和 pnpm 11.23.0。先按照后端 README 的源码开发步骤启动后端和数据库，再在前端仓库执行以下命令。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

打开[工作区](http://localhost:3000)，使用后端账号登录。浏览器直接连接 API 和 WebSocket 服务。`config/backend.json` 中的默认后端地址为 `http://localhost:8080`。使用其他后端时，启动开发服务器并指定浏览器可访问的地址。

```bash
MINDRAILS_BACKEND_BASE_URL=https://api.example.org pnpm dev
```

如果前端来源地址变化，在后端的 `MINDRAILS_ALLOWED_ORIGINS` 中加入新地址。使用 `pnpm lint`、`pnpm typecheck` 和 `pnpm test` 检查改动，使用 `pnpm build` 构建生产版本。
