import {
  Contract,
  formatUnits,
  getAddress,
  id,
  Interface,
  JsonRpcProvider,
  Log,
} from 'ethers';

import { ERC20_ABI } from './constants.js';
import type { TokenInfo } from './types.js';

const transferIface = new Interface(ERC20_ABI);

async function getTokenInfo(
  provider: JsonRpcProvider,
  tokenAddress: string,
  cache: Map<string, TokenInfo>,
): Promise<TokenInfo> {
  const key = tokenAddress.toLowerCase();
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const contract = new Contract(tokenAddress, ERC20_ABI, provider);
  let symbol = 'UNKNOWN';
  let decimals = 18;

  try {
    symbol = await contract.symbol();
  } catch {
    // Keep defaults for non-standard tokens.
  }

  try {
    decimals = Number(await contract.decimals());
  } catch {
    // Keep default decimals when unavailable.
  }

  const info = { symbol, decimals };
  cache.set(key, info);
  return info;
}

export async function parseTransfers(
  provider: JsonRpcProvider,
  logs: readonly Log[],
  tokenCache: Map<string, TokenInfo>,
): Promise<string[]> {
  const lines: string[] = [];

  for (const log of logs) {
    if (log.topics[0] !== id('Transfer(address,address,uint256)')) {
      continue;
    }

    try {
      const decoded = transferIface.parseLog(log);
      if (!decoded) {
        continue;
      }

      const token = await getTokenInfo(provider, log.address, tokenCache);
      const from = getAddress(String(decoded.args.from));
      const to = getAddress(String(decoded.args.to));
      const amount = BigInt(decoded.args.value);
      const human = formatUnits(amount, token.decimals);

      lines.push(`${token.symbol}: ${from} -> ${to} ${human}`);
    } catch {
      // Ignore unparsable transfer-like logs.
    }
  }

  return lines;
}
