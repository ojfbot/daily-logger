import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'

// Test-only preload: kill the subprocess after the artifact bundle is visible,
// immediately before LangGraph commits its final checkpoint. No production flag.
const originalPut = SqliteSaver.prototype.put
SqliteSaver.prototype.put = async function (...args: Parameters<typeof originalPut>) {
  if (args[1].channel_values.published) process.kill(process.pid, 'SIGKILL')
  return originalPut.apply(this, args)
}
