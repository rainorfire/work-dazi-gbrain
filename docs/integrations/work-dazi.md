# WorkDazi 内置内核打包

WorkDazi 通过 **分发层脚本** 嵌入 gbrain，**不修改** `src/` 核心逻辑，功能与 `bun run src/cli.ts` 一致。

## 构建产物（`dist-kernel/`）

| 路径 | 用途 |
|------|------|
| `darwin-arm64/gbrain` 等 | `bun --compile`，外部 **Postgres** 及已配置为 postgres 的会话 |
| `pglite-bundle/cli.js` + wasm | **本地 PGlite** 全功能 CLI（init / search / capture / migrate …） |
| `bun-runtime/<platform>/bun` | 随包 Bun，用户无需安装 |
| `vector.tar.gz`, `pg_trgm.tar.gz` | PGlite 扩展（与 bundle 同级目录解析） |

PGlite 不能使用单文件 compile（Bun vfs / #1340），故 PGlite 路径单独用 bundle。

## 命令

```bash
# 全平台（mac arm64+x64 + win x64）
bun run build:kernel-dist

# 仅当前平台（开发机快编）
node scripts/build-kernel-dist.mjs --current-platform-only

# 输出到 WorkDazi 目录
node scripts/build-kernel-dist.mjs --outdir=/path/to/work-dazi/kernel-dist-gbrain

# 冒烟
bun run verify:kernel-dist
```

## WorkDazi 同步

```bash
export GBRAIN_SOURCE_REPO=/Users/chenyujia/IdeaProjects/GITHUB/work-dazi-gbrain
cd /path/to/work-dazi
npm run kernel:build-gbrain-bin-and-sync
```

`sync-gbrain-kernel.mjs` 会优先调用本仓 `scripts/build-kernel-dist.mjs`。
