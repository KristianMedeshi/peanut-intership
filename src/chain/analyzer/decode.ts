import { Interface } from 'ethers';

import {
  ERC20_FUNCTIONS_ABI,
  UNISWAP_V2_ROUTER_ABI,
  UNISWAP_V3_ROUTER_ABI,
} from './constants.js';
import type { DecodeFunctionResult } from './types.js';

const interfaces = [
  {
    protocol: 'Uniswap V2 Router',
    iface: new Interface(UNISWAP_V2_ROUTER_ABI),
  },
  {
    protocol: 'Uniswap V3 Router',
    iface: new Interface(UNISWAP_V3_ROUTER_ABI),
  },
  { protocol: 'ERC20', iface: new Interface(ERC20_FUNCTIONS_ABI) },
];

export function decodeFunction(
  data: string,
  value: bigint,
): DecodeFunctionResult {
  const selector = data.length >= 10 ? data.slice(0, 10) : '0x';

  for (const item of interfaces) {
    try {
      const parsed = item.iface.parseTransaction({ data, value });
      if (parsed) {
        const args: string[] = [];
        for (let i = 0; i < parsed.args.length; i++) {
          const key = parsed.fragment.inputs[i]?.name || `arg${i}`;
          const arg = parsed.args[i];

          if (Array.isArray(arg)) {
            args.push(`${key}: [${arg.map(String).join(', ')}]`);
          } else {
            args.push(`${key}: ${String(arg)}`);
          }
        }

        return {
          selector,
          protocol: item.protocol,
          signature: parsed.signature,
          args,
        };
      }
    } catch {
      // Attempt decoding with the next known interface.
    }
  }

  return { selector };
}
