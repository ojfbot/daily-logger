import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'

// Test-only subprocess preload; no crash flag is exposed by the fixture CLI.
const originalPut = PostgresSaver.prototype.put
PostgresSaver.prototype.put = async function (...args: Parameters<typeof originalPut>) {
  if (args[1].channel_values.published) process.kill(process.pid, 'SIGKILL')
  return originalPut.apply(this, args)
}
