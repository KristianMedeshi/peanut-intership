export type TokenInfo = {
  symbol: string;
  decimals: number;
};

export type OutputFormat = 'text' | 'json';

export type AnalyzerOptions = {
  txHash: string;
  rpcUrl: string;
  format: OutputFormat;
  trace: boolean;
  mev: boolean;
};

export type DecodeFunctionResult = {
  selector: string;
  protocol?: string;
  signature?: string;
  args?: string[];
};

export type TraceCall = {
  depth: number;
  type: string;
  from: string;
  to: string;
  value: string;
  gasUsed?: string;
  error?: string;
};

export type TraceAnalysis = {
  enabled: boolean;
  available: boolean;
  error?: string;
  totalCalls?: number;
  failedCalls?: number;
  maxDepth?: number;
  calls?: TraceCall[];
};

export type MevSignal = {
  level: 'low' | 'medium' | 'high';
  kind: 'frontrun' | 'sandwich';
  detail: string;
};

export type MevAnalysis = {
  enabled: boolean;
  available: boolean;
  error?: string;
  score?: number;
  likelyFrontrun?: boolean;
  likelySandwich?: boolean;
  signals?: MevSignal[];
};

export type AnalyzerResult = {
  hash: string;
  block: number | 'PENDING';
  timestamp: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  from: string;
  to: string;
  valueEth: string;
  gas: {
    limit: string;
    used: string | 'PENDING';
    usagePercent?: string;
    effectivePriceGwei?: string;
    transactionFeeEth?: string;
  };
  functionCall: {
    selector: string;
    protocol: string;
    signature: string;
    args: string[];
  };
  transfers: string[];
  poolEvents: string[];
  failureReason?: string;
  trace: TraceAnalysis;
  mev: MevAnalysis;
};
