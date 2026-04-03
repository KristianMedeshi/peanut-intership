import { Interface, Log } from 'ethers';

import { PAIR_EVENTS_ABI, UNISWAP_V3_POOL_EVENTS_ABI } from './constants.js';

const pairEventIface = new Interface(PAIR_EVENTS_ABI);
const uniswapV3PoolEventIface = new Interface(UNISWAP_V3_POOL_EVENTS_ABI);

export function parsePoolEvents(logs: readonly Log[]): string[] {
  const lines: string[] = [];

  for (const log of logs) {
    try {
      const parsed = pairEventIface.parseLog(log);
      if (parsed) {
        if (parsed.name === 'Swap') {
          lines.push(
            `V2 Swap: sender=${parsed.args.sender} amount0In=${parsed.args.amount0In} amount1In=${parsed.args.amount1In} amount0Out=${parsed.args.amount0Out} amount1Out=${parsed.args.amount1Out}`,
          );
        }

        if (parsed.name === 'Sync') {
          lines.push(
            `Sync: reserve0=${parsed.args.reserve0} reserve1=${parsed.args.reserve1}`,
          );
        }
      }
    } catch {
      // Not a V2 pair event.
    }

    try {
      const parsedV3 = uniswapV3PoolEventIface.parseLog(log);
      if (parsedV3 && parsedV3.name === 'Swap') {
        lines.push(
          `V3 Swap: sender=${parsedV3.args.sender} recipient=${parsedV3.args.recipient} amount0=${parsedV3.args.amount0} amount1=${parsedV3.args.amount1} tick=${parsedV3.args.tick}`,
        );
      }
    } catch {
      // Not a V3 pool event.
    }
  }

  return lines;
}
