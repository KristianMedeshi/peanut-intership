import {
  JsonRpcProvider,
  TransactionReceipt as EthersTransactionReceipt,
  TransactionResponse as EthersTransactionResponse,
} from 'ethers';

export async function tryGetRevertReason(
  provider: JsonRpcProvider,
  tx: EthersTransactionResponse,
  receipt: EthersTransactionReceipt,
): Promise<string | null> {
  if (receipt.status === 1 || receipt.blockNumber <= 0) {
    return null;
  }

  try {
    await provider.call({
      from: tx.from,
      to: tx.to,
      data: tx.data,
      value: tx.value,
      blockTag: receipt.blockNumber - 1,
    });
    return null;
  } catch (error) {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
