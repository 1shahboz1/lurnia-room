import { spawnSync } from 'node:child_process'

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: 'inherit' })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

const isVercel = !!process.env.VERCEL

if (!isVercel) {
  // Local builds can rely on the developer having already pulled LFS assets.
  process.exit(0)
}

console.log('[vercel-lfs] Vercel build detected. Pulling Git LFS assets...')

// Fail fast with a clear error if git-lfs isn't available in the build image.
run('git', ['--version'])
run('git', ['lfs', 'version'])

// Ensure hooks/filters are configured for this clone.
run('git', ['lfs', 'install', '--local'])

// Pull the binary assets needed at runtime.
// Note: keep JSON out of LFS (we moved it to regular git).
run('git', [
  'lfs',
  'pull',
  '--include',
  'public/inventory/**,public/textures/**,public/models/**,public/rooms/**,*.png',
])

console.log('[vercel-lfs] Git LFS pull complete.')
