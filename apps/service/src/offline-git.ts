import { execFileSync } from 'node:child_process'

/** These controls apply to every Git subprocess, independently of Node's fetch guard. */
export function offlineGitEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env }
  // Do not let ambient GIT_DIR, alternate object stores, config overrides, or
  // discovery ceilings redirect reads or hide a repository from path checks.
  // Trace variables are retained for local diagnostics and the no-fetch proof.
  for (const key of Object.keys(environment)) {
    if (key.startsWith('GIT_') && !key.startsWith('GIT_TRACE')) delete environment[key]
  }
  return {
    ...environment,
    LC_ALL: 'C',
    GIT_NO_LAZY_FETCH: '1',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_ALLOW_PROTOCOL: '',
    GIT_TERMINAL_PROMPT: '0',
    GIT_DISCOVERY_ACROSS_FILESYSTEM: '1',
  }
}

export function offlineGit(args: string[], cwd: string): Buffer {
  return execFileSync('git', ['--no-lazy-fetch', '--no-replace-objects', '-c', 'protocol.allow=never', ...args], {
    cwd,
    env: offlineGitEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  })
}
