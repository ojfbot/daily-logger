import { request } from 'node:https'
import type { ClientRequest } from 'node:http'
import { lookup } from 'node:dns'
import { ExportResultCode, type ExportResult } from '@opentelemetry/core'
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'
import { OTLPExporterBase, createOtlpNetworkExportDelegate, ExporterMetrics, type IExporterTransport, type ExportResponse } from '@opentelemetry/otlp-exporter-base'
import { JsonTraceSerializer, TraceExporterMetricsHelper } from '@opentelemetry/otlp-transformer'
import { EXPORT_LIMITS, privateAddress } from './telemetry-export-config.js'
import { projectWireSpan } from './telemetry-wire.js'

const failure = (): ExportResponse => ({ status: 'failure', error: new Error('export_transport') })
const failed = (): ExportResult => ({ code: ExportResultCode.FAILED, error: new Error('export_failed') })

/** Supported OTel transport seam; no fetch, global agent, proxy or redirect handler. */
export function createHttpsTransport(config: { endpoint: string; authorization: string; ca: string; maxBytes?: number }): IExporterTransport & { diagnostics(): { requests: number; inFlight: number; rejected: number; closed: boolean } } {
  const url = new URL(config.endpoint)
  const maxBytes = config.maxBytes ?? EXPORT_LIMITS.bodyBytes
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/api/public/otel/v1/traces'
    || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > EXPORT_LIMITS.bodyBytes) throw new Error('export_config')
  let active: ClientRequest | undefined, closed = false, requests = 0, rejected = 0
  return {
    diagnostics: () => ({ requests, inFlight: active ? 1 : 0, rejected, closed }),
    send(data, timeoutMillis) {
      if (closed || active || data.byteLength > maxBytes || !Number.isInteger(timeoutMillis) || timeoutMillis < 1 || timeoutMillis > EXPORT_LIMITS.requestMs) {
        rejected++; return Promise.resolve(failure())
      }
      return new Promise(resolve => {
        let result: ExportResponse | undefined, timer: NodeJS.Timeout | undefined
        let req: ClientRequest
        try {
          // IP literals do not invoke lookup, so validate those explicitly too.
          const host = url.hostname.replace(/^\[|\]$/g, '')
          if (/^[\d.]+$/.test(host) || host.includes(':')) { if (!privateAddress(host)) throw new Error('export_address') }
          req = request(url, {
            method: 'POST', agent: false, ca: config.ca, rejectUnauthorized: true, maxHeaderSize: 8192,
            lookup: (hostname, options, callback) => {
              lookup(hostname, { family: options.family, all: true }, (error, addresses) => {
                if (error || !addresses.length || addresses.some(({ address }) => !privateAddress(address))) {
                  callback(new Error('export_address'), []); return
                }
                if (options.all) callback(null, addresses)
                else callback(null, addresses[0].address, addresses[0].family)
              })
            },
            headers: { 'content-type': 'application/json', 'content-length': String(data.byteLength), authorization: config.authorization, 'x-langfuse-ingestion-version': '4' },
          })
        } catch { resolve(failure()); return }
        active = req; requests++
        req.once('response', response => {
          if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) > 299) {
            result = failure(); response.destroy(); req.destroy(); return
          }
          const chunks: Buffer[] = []; let size = 0
          response.on('data', (chunk: Buffer) => {
            size += chunk.byteLength
            if (size > EXPORT_LIMITS.responseBytes) { closed = true; result = failure(); response.destroy(); req.destroy(); return }
            chunks.push(chunk)
          })
          response.once('end', () => { result ??= { status: 'success', data: Buffer.concat(chunks, size) } })
          response.once('error', () => { result ??= failure(); req.destroy() })
        })
        req.once('error', () => { result ??= failure() })
        // A timed-out request retains the one slot until its actual close.
        req.once('close', () => { if (timer) clearTimeout(timer); active = undefined; resolve(result ?? failure()) })
        timer = setTimeout(() => { closed = true; result = failure(); req.destroy() }, timeoutMillis)
        timer.unref()
        req.end(data) // SAME exact checked serializer bytes, no compression.
      })
    },
    shutdown() { closed = true; active?.destroy() },
  }
}

/** One bounded queue, at most one official serializer/transport call in flight. */
export function createQueuedExporter(transport: IExporterTransport, timeoutMillis: number = EXPORT_LIMITS.requestMs): SpanExporter & { diagnostics(): { queued: number; inFlight: number; dropped: number; closed: boolean } } {
  const metrics = new ExporterMetrics({ componentType: 'dailylogger', metricsHelper: TraceExporterMetricsHelper, url: undefined, meterProvider: undefined, responseAttributesFromError: () => ({}) })
  const delegate = new OTLPExporterBase(createOtlpNetworkExportDelegate<ReadableSpan[], unknown>({ timeoutMillis, concurrencyLimit: 1, compression: 'none' }, JsonTraceSerializer, metrics, transport))
  const queue: { span: ReadableSpan; done: (result: ExportResult) => void }[] = []
  let busy = false, closed = false, dropped = 0, scheduled = false
  const call = (callback: (result: ExportResult) => void, result: ExportResult) => { try { callback(result) } catch { /* diagnostic callback cannot escape */ } }
  const drain = () => {
    scheduled = false
    if (busy || closed || !queue.length) return
    busy = true
    const batch = queue.splice(0, EXPORT_LIMITS.batch)
    const complete = (result: ExportResult) => {
      // The delegate invokes its callback before releasing its concurrency slot.
      void delegate.forceFlush().then(() => {
        busy = false
        if (result.code !== ExportResultCode.SUCCESS) { closed = true; transport.shutdown(); dropped += queue.length; for (const item of queue.splice(0)) call(item.done, failed()) }
        for (const item of batch) call(item.done, result)
        drain()
      }, () => { busy = false; closed = true; transport.shutdown(); for (const item of [...batch, ...queue.splice(0)]) call(item.done, failed()) })
    }
    try { delegate.export(batch.map(item => item.span), complete) } catch { complete(failed()) }
  }
  return {
    diagnostics: () => ({ queued: queue.length, inFlight: busy ? 1 : 0, dropped, closed }),
    export(spans, callback) {
      if (closed || spans.length !== 1 || queue.length >= EXPORT_LIMITS.spans) { dropped += spans.length; call(callback, failed()); return }
      const projected = projectWireSpan(spans[0])
      if (!projected) { dropped++; call(callback, failed()); return }
      queue.push({ span: projected, done: callback })
      if (!scheduled && !busy) { scheduled = true; setImmediate(drain) }
    },
    async forceFlush() {
      drain()
      while (busy || queue.length) await new Promise(resolve => setTimeout(resolve, 5))
    },
    async shutdown() {
      closed = true; transport.shutdown() // Abort BEFORE the delegate's drain.
      for (const item of queue.splice(0)) { dropped++; call(item.done, failed()) }
      await delegate.shutdown()
    },
  }
}
