import { getAddress, JsonRpcProvider } from 'ethers';

import type { TraceAnalysis, TraceCall } from './types.js';

function normalizeHexAddress(value: string): string {
  if (!value) {
    return value;
  }

  try {
    return getAddress(value);
  } catch {
    return value;
  }
}

function flattenTraceCalls(node: unknown, depth = 0): TraceCall[] {
  if (!node || typeof node !== 'object') {
    return [];
  }

  const traceNode = node as {
    type?: string;
    from?: string;
    to?: string;
    value?: string;
    gasUsed?: string;
    error?: string;
    calls?: unknown[];
  };

  const current: TraceCall = {
    depth,
    type: traceNode.type || 'CALL',
    from: normalizeHexAddress(traceNode.from || ''),
    to: normalizeHexAddress(traceNode.to || ''),
    value: traceNode.value || '0x0',
    gasUsed: traceNode.gasUsed,
    error: traceNode.error,
  };

  const nested = Array.isArray(traceNode.calls)
    ? traceNode.calls.flatMap((item) => flattenTraceCalls(item, depth + 1))
    : [];

  return [current, ...nested];
}

export async function getTraceAnalysis(
  provider: JsonRpcProvider,
  txHash: string,
  enabled: boolean,
): Promise<TraceAnalysis> {
  if (!enabled) {
    return {
      enabled: false,
      available: false,
      error: 'Trace analysis disabled by flag.',
    };
  }

  try {
    const trace = await provider.send('debug_traceTransaction', [
      txHash,
      { tracer: 'callTracer' },
    ]);

    const calls = flattenTraceCalls(trace);
    const failedCalls = calls.filter((call) => Boolean(call.error)).length;
    const maxDepth = calls.reduce((acc, call) => Math.max(acc, call.depth), 0);

    return {
      enabled: true,
      available: true,
      totalCalls: calls.length,
      failedCalls,
      maxDepth,
      calls,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      enabled: true,
      available: false,
      error: message,
    };
  }
}
