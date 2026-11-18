const OWNER_LABEL = 'dailylogger.runtime-smoke.owner'
const TIMEOUT = 5000

/** Standalone smoke ownership is independent of the disposable Compose project. */
export function ownedContainer(docker, name, owner) {
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(name) || !/^[a-f0-9-]{36}$/.test(owner)) throw new Error('Invalid smoke ownership')
  const options = { timeout: TIMEOUT, acceptFailure: true }
  const list = () => {
    const result = docker(['container', 'ls', '--all', '--quiet', '--no-trunc', '--filter', `name=${name}`, '--filter', `label=${OWNER_LABEL}=${owner}`], options)
    if (result.error || result.status !== 0) throw new Error('Owned offline container lookup failed')
    const ids = result.stdout.trim().split('\n').filter(Boolean)
    if (ids.length > 1 || ids.some(id => !/^[a-f0-9]{64}$/.test(id))) throw new Error('Ambiguous offline container identity')
    return ids
  }
  return {
    run(args, inputOptions) { return docker(['run', '--name', name, '--label', `${OWNER_LABEL}=${owner}`, ...args], inputOptions) },
    cleanup() {
      const [id] = list()
      if (!id) return // --rm completed, or no container was created by this run.
      // Read only ownership metadata, never another container's env or secrets.
      const format = `{"id":{{json .Id}},"name":{{json .Name}},"owner":{{json (index .Config.Labels "${OWNER_LABEL}")}}}`
      const inspection = docker(['inspect', '--type', 'container', '--format', format, id], options)
      if (inspection.error || inspection.status !== 0) {
        if (!list().length) return // --rm may race the inspection.
        throw new Error('Owned offline container inspection failed')
      }
      let identity
      try { identity = JSON.parse(inspection.stdout) } catch { throw new Error('Invalid offline container identity') }
      if (identity.id !== id || identity.name !== `/${name}` || identity.owner !== owner) throw new Error('Offline container ownership mismatch')
      // Remove by verified immutable ID, never by a potentially reused name.
      const removal = docker(['container', 'rm', '--force', id], options)
      if ((removal.error || removal.status !== 0) && list().length) throw new Error('Owned offline container removal failed')
    },
  }
}
