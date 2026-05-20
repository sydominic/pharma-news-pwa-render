# Pharma News PWA

React + Node API 기반 제약뉴스 RSS 대시보드입니다.

## Render v25 설정

- Build Command: `bash render-build.sh`
- Start Command: `node server/src/index.js`
- Health Check Path: `/api/health`

필수 환경변수:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `NODE_VERSION=20.11.1`

`PORT`, `VITE_API_BASE_URL`, 실제 `.env` 파일은 GitHub에 올리지 않습니다.
