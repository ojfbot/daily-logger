import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkShipmentTimeCoverage } from '../src/shipment-time-coverage.js'

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const date = process.argv[2]
  if (!date) throw new Error('Usage: pnpm check:shipment-times YYYY-MM-DD')
  console.log(JSON.stringify(checkShipmentTimeCoverage(process.cwd(), date), null, 2))
}
