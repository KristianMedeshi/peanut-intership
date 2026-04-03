import type { AnalyzerResult, MevAnalysis, TraceAnalysis } from './types.js';

function printHeader(title: string): void {
  console.log(title);
  console.log('='.repeat(title.length));
}

function printTrace(trace: TraceAnalysis): void {
  console.log('');
  console.log('Trace Analysis');
  console.log('--------------');

  if (!trace.enabled) {
    console.log('Disabled');
    return;
  }

  if (!trace.available) {
    console.log(
      `Unavailable: ${trace.error || 'Trace API not available on RPC node.'}`,
    );
    return;
  }

  console.log(`Total Calls:     ${trace.totalCalls}`);
  console.log(`Failed Calls:    ${trace.failedCalls}`);
  console.log(`Max Depth:       ${trace.maxDepth}`);

  const preview = (trace.calls || []).slice(0, 12);
  if (preview.length > 0) {
    console.log('Internal Calls:');
    for (const call of preview) {
      const indent = '  '.repeat(call.depth);
      const errorPart = call.error ? ` error=${call.error}` : '';
      console.log(
        `${indent}- ${call.type} ${call.from} -> ${call.to} value=${call.value}${errorPart}`,
      );
    }
  }
}

function printMev(mev: MevAnalysis): void {
  console.log('');
  console.log('MEV Detection');
  console.log('-------------');

  if (!mev.enabled) {
    console.log('Disabled');
    return;
  }

  if (!mev.available) {
    console.log(
      `Unavailable: ${mev.error || 'Insufficient data for block-level analysis.'}`,
    );
    return;
  }

  console.log(`Score:           ${mev.score}/100`);
  console.log(`Likely Frontrun: ${mev.likelyFrontrun ? 'YES' : 'NO'}`);
  console.log(`Likely Sandwich: ${mev.likelySandwich ? 'YES' : 'NO'}`);

  if ((mev.signals || []).length === 0) {
    console.log('Signals:         None');
    return;
  }

  console.log('Signals:');
  for (const signal of mev.signals || []) {
    console.log(
      `  - [${signal.level.toUpperCase()}] ${signal.kind}: ${signal.detail}`,
    );
  }
}

export function printText(result: AnalyzerResult): void {
  printHeader('Transaction Analysis');
  console.log(`Hash:            ${result.hash}`);
  console.log(`Block:           ${result.block}`);
  console.log(`Timestamp:       ${result.timestamp}`);
  console.log(`Status:          ${result.status}`);

  console.log('');
  console.log(`From:            ${result.from}`);
  console.log(`To:              ${result.to}`);
  console.log(`Value:           ${result.valueEth} ETH`);

  console.log('');
  console.log('Gas Analysis');
  console.log('------------');
  console.log(`Gas Limit:       ${result.gas.limit}`);
  console.log(
    `Gas Used:        ${result.gas.used}${result.gas.usagePercent ? ` (${result.gas.usagePercent}%)` : ''}`,
  );
  if (result.gas.effectivePriceGwei) {
    console.log(`Effective Price: ${result.gas.effectivePriceGwei} gwei`);
  }
  if (result.gas.transactionFeeEth) {
    console.log(`Transaction Fee: ${result.gas.transactionFeeEth} ETH`);
  }

  console.log('');
  console.log('Function Called');
  console.log('---------------');
  console.log(`Selector:        ${result.functionCall.selector}`);
  console.log(`Protocol:        ${result.functionCall.protocol}`);
  console.log(`Function:        ${result.functionCall.signature}`);
  if (result.functionCall.args.length > 0) {
    console.log('Arguments:');
    for (const line of result.functionCall.args) {
      console.log(`  - ${line}`);
    }
  }

  console.log('');
  console.log('Token Transfers');
  console.log('---------------');
  if (result.transfers.length === 0) {
    console.log('None detected');
  } else {
    for (let i = 0; i < result.transfers.length; i++) {
      console.log(`${i + 1}. ${result.transfers[i]}`);
    }
  }

  console.log('');
  console.log('Pool Events');
  console.log('-----------');
  if (result.poolEvents.length === 0) {
    console.log('None detected');
  } else {
    for (const line of result.poolEvents) {
      console.log(line);
    }
  }

  if (result.failureReason) {
    console.log('');
    console.log('Failure Details');
    console.log('---------------');
    console.log(`Revert Reason:   ${result.failureReason}`);
  }

  printTrace(result.trace);
  printMev(result.mev);
}
