# MindRails Frontend

![Next.js 16](https://img.shields.io/badge/Next.js-16-171717) ![React 19](https://img.shields.io/badge/React-19-087ea4) ![Node.js 24](https://img.shields.io/badge/Node.js-24-417e38) ![pnpm 11](https://img.shields.io/badge/pnpm-11-925e09)

[简体中文](README.cn.md)

The Next.js and React web client for MindRails. Team members use the workspace to run agent sessions, work with documents and review deliverables. For deployment, see the [backend README](https://github.com/patternrails/mindrails-backend/blob/main/README.md). For a screenshot tour, see the [product introduction](https://github.com/patternrails/mindrails-backend/blob/main/Introduction.md).

## Local development

Use Node.js 24.18.1 and pnpm 11.23.0. Start the backend and its databases using the backend README’s source-development instructions. In the frontend checkout, run the following.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open [the workspace](http://localhost:3000) and sign in with a backend account. The browser connects directly to the API and WebSocket server. The default backend URL is `http://localhost:8080` in `config/backend.json`. To use another backend, start the dev server with the URL your browser can reach.

```bash
MINDRAILS_BACKEND_BASE_URL=https://api.example.org pnpm dev
```

If the frontend origin changes, add the new origin to `MINDRAILS_ALLOWED_ORIGINS` on the backend. Run `pnpm lint`, `pnpm typecheck` and `pnpm test` to check changes. Build the production client with `pnpm build`.
