import { readFileSync, writeFileSync } from 'node:fs'
import { readActionRegistry, readArticleStatuses, ActionRegistrySchema } from '../src/action-registry.js'
import { reviewArticleActions } from '../src/review-actions.js'
void (async () => {
const root=process.cwd(), receiptPath=process.argv[2]
if (!receiptPath) throw new Error('Pass the previously authorized no-write review receipt; this command calls no provider')
const receipt=ActionRegistrySchema.parse(JSON.parse(readFileSync(receiptPath,'utf8')).registry)
let promptBytes=0
try { await reviewArticleActions({registry:readActionRegistry(root), articleDate:'2026-10-17', markdown:readFileSync('_articles/2026-10-17.md','utf8'), feedback:'Local context-size measurement only', sources:receipt.articles[0].sources, articleStatuses:readArticleStatuses(root), agents:{propose:async context=>{promptBytes=Buffer.byteLength(context);throw new Error('Measurement complete; no provider called')},verify:async()=>{throw new Error('No verifier should run')}}}) } catch(error) { if(!promptBytes) throw error }
const value={schemaVersion:1,method:'Build the current proposer context using only the previously authorized receipt sources and an injected local capture. No remote calls or state writes.',baselineBytes:Buffer.byteLength(readFileSync('actions/registry.json')),articleFileBytes:Buffer.byteLength(readFileSync('actions/articles/2026-10-17.json')),sourceBytes:receipt.articles[0].sources.reduce((total:number,source:{content:string})=>total+Buffer.byteLength(source.content),0),proposerPromptBytes:promptBytes,limits:{source:131072,totalSources:393216,prompt:655360,articleFile:65536}}
writeFileSync('reviews/action-cutover-size-check.json',JSON.stringify(value,null,2)+'\n');console.log(value)
})()
