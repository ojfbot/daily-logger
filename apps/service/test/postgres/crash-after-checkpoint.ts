import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'

// Prove that a durable final checkpoint repairs an application row left behind.
const originalPut = PostgresSaver.prototype.put
PostgresSaver.prototype.put = async function (...args: Parameters<typeof originalPut>) {
  const saved = await originalPut.apply(this, args)
  if (args[1].channel_values.published) process.kill(process.pid, 'SIGKILL')
  return saved
}
