#!/usr/bin/env node
/**
 * WorkDazi 内置内核产物（dist-kernel/）。
 *
 * 不修改 src/ 业务逻辑：仅打包分发。
 *   - <platform>/gbrain     bun --compile（Postgres / 非 PGlite 路径）
 *   - pglite-bundle/        bun build + PGlite WASM（本地 PGlite 全功能）
 *   - bun-runtime/          随包 bun，避免依赖用户本机安装
 *
 * 用法：
 *   node scripts/build-kernel-dist.mjs
 *   node scripts/build-kernel-dist.mjs --outdir=/path/to/kernel-dist-gbrain
 *   node scripts/build-kernel-dist.mjs --current-platform-only
 */
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const argv = process.argv.slice(2)
const flagSet = new Set()
let outdirArg
for (const a of argv) {
  if (a.startsWith('--outdir=')) outdirArg = a.slice('--outdir='.length)
  else if (a === '--outdir') outdirArg = argv[argv.indexOf(a) + 1]
  else if (a.startsWith('--')) flagSet.add(a)
}

const currentPlatformOnly =
  flagSet.has('--current-platform-only') || process.env.CURRENT_PLATFORM_ONLY === '1'
const verbose = flagSet.has('--verbose')

const outDir = path.resolve(outdirArg || path.join(repoRoot, 'dist-kernel'))
const PGLITE_BUNDLE_DIR = 'pglite-bundle'

const PLATFORM_SPECS = [
  { id: 'darwin-arm64', bunTarget: 'bun-darwin-arm64', binName: 'gbrain' },
  { id: 'darwin-x64', bunTarget: 'bun-darwin-x64', binName: 'gbrain' },
  { id: 'win32-x64', bunTarget: 'bun-windows-x64', binName: 'gbrain.exe' }
]

function log(...args) {
  console.log('[build-kernel-dist]', ...args)
}
function vlog(...args) {
  if (verbose) log(...args)
}

function currentPlatformKey() {
  const os =
    process.platform === 'darwin'
      ? 'darwin'
      : process.platform === 'win32'
        ? 'win32'
        : 'linux'
  const arch = process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : process.arch
  return `${os}-${arch}`
}

function platformsToBuild() {
  if (currentPlatformOnly) {
    const key = currentPlatformKey()
    const spec = PLATFORM_SPECS.find((p) => p.id === key)
    return spec ? [spec] : []
  }
  return [...PLATFORM_SPECS]
}

function findBun() {
  const home = process.env.HOME || process.env.USERPROFILE || ''
  const candidates =
    process.platform === 'win32'
      ? [
          path.join(process.env.LOCALAPPDATA || '', 'bun', 'bin', 'bun.exe'),
          path.join(home, '.bun', 'bin', 'bun.exe'),
          'bun.exe'
        ]
      : [
          path.join(home, '.bun/bin/bun'),
          '/opt/homebrew/bin/bun',
          '/usr/local/bin/bun',
          'bun'
        ]
  for (const c of candidates) {
    try {
      execSync(`"${c}" --version`, { stdio: 'pipe' })
      return c
    } catch {}
  }
  return null
}

function sha256File(filePath) {
  const hash = createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

function cleanOutDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    return
  }
  for (const entry of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true })
  }
}

function readVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
    return pkg.version || null
  } catch {
    return null
  }
}

function copyBunRuntime(bun, specs) {
  for (const spec of specs) {
    const destDir = path.join(outDir, 'bun-runtime', spec.id)
    fs.mkdirSync(destDir, { recursive: true })
    const dest = path.join(destDir, spec.binName === 'gbrain.exe' ? 'bun.exe' : 'bun')
    fs.copyFileSync(bun, dest)
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(dest, 0o755)
      } catch {}
    }
    vlog('bun-runtime', spec.id)
  }
}

function buildPgliteBundle(bun) {
  const bundleDir = path.join(outDir, PGLITE_BUNDLE_DIR)
  const pgliteDist = path.join(repoRoot, 'node_modules', '@electric-sql', 'pglite', 'dist')
  if (!fs.existsSync(pgliteDist)) {
    throw new Error('缺少 @electric-sql/pglite，请先 bun install')
  }

  if (fs.existsSync(bundleDir)) {
    fs.rmSync(bundleDir, { recursive: true, force: true })
  }
  fs.mkdirSync(bundleDir, { recursive: true })

  log('构建 pglite-bundle（完整 CLI，供本地 PGlite）…')
  execSync(`"${bun}" build src/cli.ts --outdir "${bundleDir}" --target=bun`, {
    cwd: repoRoot,
    stdio: 'inherit'
  })

  for (const name of ['pglite.data', 'pglite.wasm', 'initdb.wasm']) {
    const src = path.join(pgliteDist, name)
    if (!fs.existsSync(src)) {
      throw new Error(`缺少 PGlite 资源: ${name}`)
    }
    fs.copyFileSync(src, path.join(bundleDir, name))
  }

  for (const name of ['vector.tar.gz', 'pg_trgm.tar.gz']) {
    const src = path.join(pgliteDist, name)
    if (!fs.existsSync(src)) {
      throw new Error(`缺少 PGlite 扩展包: ${name}`)
    }
    fs.copyFileSync(src, path.join(outDir, name))
  }

  log(`pglite-bundle → ${bundleDir}`)
}

function main() {
  const bun = findBun()
  if (!bun) {
    console.error('[build-kernel-dist] 未找到 bun')
    process.exit(1)
  }

  log(`源仓: ${repoRoot}`)
  log(`输出: ${outDir}`)

  if (!fs.existsSync(path.join(repoRoot, 'node_modules'))) {
    log('bun install …')
    execSync(`"${bun}" install`, { cwd: repoRoot, stdio: 'inherit' })
  }

  const adminEmbedded = path.join(repoRoot, 'scripts/build-admin-embedded.ts')
  if (fs.existsSync(adminEmbedded)) {
    try {
      log('build-admin-embedded …')
      execSync(`"${bun}" run scripts/build-admin-embedded.ts`, { cwd: repoRoot, stdio: 'inherit' })
    } catch {
      log('警告: admin 嵌入失败，serve --http 可能不可用')
    }
  }

  cleanOutDir(outDir)
  fs.mkdirSync(outDir, { recursive: true })

  const specs = platformsToBuild()
  if (specs.length === 0) {
    console.error('[build-kernel-dist] 当前平台不在支持列表中')
    process.exit(1)
  }

  buildPgliteBundle(bun)
  copyBunRuntime(bun, specs)

  const platformEntries = []
  for (const spec of specs) {
    const platDir = path.join(outDir, spec.id)
    fs.mkdirSync(platDir, { recursive: true })
    const outFile = path.join(platDir, spec.binName)
    log(`编译 ${spec.id} → ${spec.binName} …`)
    execSync(
      `"${bun}" build --compile --target=${spec.bunTarget} --outfile "${outFile}" src/cli.ts`,
      { cwd: repoRoot, stdio: 'inherit' }
    )
    if (process.platform !== 'win32' && !spec.binName.endsWith('.exe')) {
      try {
        fs.chmodSync(outFile, 0o755)
      } catch {}
    }
    const stat = fs.statSync(outFile)
    platformEntries.push({
      id: spec.id,
      binary: `${spec.id}/${spec.binName}`,
      sha256: sha256File(outFile),
      sizeBytes: stat.size
    })
  }

  const version = readVersion()
  const manifest = {
    version,
    builtAt: new Date().toISOString(),
    apiVersion: 1,
    minWorkDazi: '0.1.0',
    layout: 'work-dazi-kernel-dist',
    pglite: {
      bundleDir: PGLITE_BUNDLE_DIR,
      entry: `${PGLITE_BUNDLE_DIR}/cli.js`,
      note: 'WorkDazi runs PGlite via bun-runtime + pglite-bundle (full CLI)'
    },
    platforms: platformEntries,
    spawn: {
      postgres: '<platform-binary>',
      pglite: 'bun-runtime/<platform>/bun + pglite-bundle/cli.js'
    },
    env: {
      GBRAIN_HOME: 'Brain data root; .gbrain/config.json + database'
    }
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  fs.writeFileSync(
    path.join(outDir, 'BUILD-INFO.json'),
    JSON.stringify(
      {
        builtAt: new Date().toISOString(),
        sourceRepo: repoRoot,
        gbrainVersion: version,
        platformKept: currentPlatformOnly ? currentPlatformKey() : 'all',
        bunVersion: execSync(`"${bun}" --version`, { encoding: 'utf8' }).trim()
      },
      null,
      2
    ) + '\n'
  )

  log('完成')
}

main()
