#!/usr/bin/env node
/**
 * 冒烟 dist-kernel/：编译二进制 --version + PGlite init（pglite-bundle）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(repoRoot, 'dist-kernel')

function fail(msg) {
  console.error('[verify-kernel-dist] ✗', msg)
  process.exit(1)
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

if (!fs.existsSync(path.join(distDir, 'manifest.json'))) {
  fail('缺少 dist-kernel/manifest.json，请先 node scripts/build-kernel-dist.mjs')
}

const key = currentPlatformKey()
const isWin = process.platform === 'win32'
const binRel = `${key}/${isWin ? 'gbrain.exe' : 'gbrain'}`
const binPath = path.join(distDir, binRel)
if (!fs.existsSync(binPath)) {
  fail(`缺少 ${binRel}`)
}

const home = mkdtempSync(path.join(tmpdir(), 'gbrain-verify-'))
try {
  const ver = execFileSync(binPath, ['--version'], {
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, GBRAIN_HOME: home }
  }).trim()
  console.log('[verify-kernel-dist] ✓ compile --version:', ver.split('\n')[0])

  const bunPath = path.join(distDir, 'bun-runtime', key, isWin ? 'bun.exe' : 'bun')
  const bundleCli = path.join(distDir, 'pglite-bundle', 'cli.js')
  if (!fs.existsSync(bunPath)) fail('缺少 bun-runtime')
  if (!fs.existsSync(bundleCli)) fail('缺少 pglite-bundle/cli.js')

  const bundleDir = path.dirname(bundleCli)
  const parentDir = path.dirname(bundleDir)
  for (const name of ['vector.tar.gz', 'pg_trgm.tar.gz']) {
    const src = path.join(distDir, name)
  const dest = path.join(parentDir, name)
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
      fs.copyFileSync(src, dest)
    }
  }

  const pgliteHome = mkdtempSync(path.join(tmpdir(), 'gbrain-pglite-verify-'))
  execSync(`"${bunPath}" "${bundleCli}" init --pglite --non-interactive --no-embedding`, {
    cwd: bundleDir,
    stdio: 'pipe',
    timeout: 180000,
    env: { ...process.env, GBRAIN_HOME: pgliteHome }
  })
  const cfg = path.join(pgliteHome, '.gbrain', 'config.json')
  if (!fs.existsSync(cfg)) fail('PGlite init 未生成 config.json')
  console.log('[verify-kernel-dist] ✓ pglite-bundle init')
} catch (e) {
  fail(e.stderr?.toString() || e.message || String(e))
} finally {
  try {
    rmSync(home, { recursive: true, force: true })
  } catch {}
}

console.log('[verify-kernel-dist] ✓ 全部通过')
