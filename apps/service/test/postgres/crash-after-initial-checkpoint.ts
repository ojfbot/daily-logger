import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'

// Hold all pending writes so the database contains only the initial input
// checkpoint. It stores __start__ input while the public snapshot values are {}.
PostgresSaver.prototype.putWrites = async function () { await new Promise(() => {}) }
const originalPut = PostgresSaver.prototype.put
PostgresSaver.prototype.put = async function (...args: Parameters<typeof originalPut>) {
  const saved = await originalPut.apply(this, args)
  if (args[2].source === 'input' && args[2].step === -1) process.kill(process.pid, 'SIGKILL')
  return saved
}
