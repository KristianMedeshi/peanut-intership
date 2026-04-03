import 'dotenv/config';

import { formatEther, formatUnits, Transaction, getAddress } from 'ethers';

import { ChainClient, TransactionBuilder } from '@/chain/index';
import { Address, TokenAmount } from '@/core/types';
import { WalletManager } from '@/core/wallet';
import { requireEnv } from '@/lib/requireEnv';

const DEFAULT_CHAIN_ID = 11155111; // Sepolia

async function main(): Promise<void> {
  step('1. Load wallet');
  const wallet = WalletManager.fromEnv();
  console.log(`Wallet: ${wallet.address}`);

  step('2. Connect to Sepolia');
  const rpcUrl = process.env.RPC_URL;
  const wsUrl = process.env.WS_URL;

  const providerUrls: string[] = [];
  if (wsUrl) providerUrls.push(wsUrl);
  if (rpcUrl) providerUrls.push(rpcUrl);

  if (providerUrls.length === 0) {
    throw new Error('At least one of RPC_URL or WS_URL must be configured');
  }

  const client = new ChainClient(providerUrls);
  const recipient = parseRecipient(wallet.address);
  console.log(`Providers Context: ${providerUrls.length} configured`);
  console.log(`Recipient: ${recipient.checksum}`);

  step('3. Check balance');
  const balance = await client.getBalance(Address.fromString(wallet.address));
  console.log(`Balance: ${balance.human} ETH`);

  step('4. Build transfer transaction');
  const transferValue = TokenAmount.fromHuman(
    requireEnv('TRANSFER_VALUE_ETH'),
    18,
    'ETH',
  );

  const chainId = Number(process.env.CHAIN_ID || DEFAULT_CHAIN_ID);
  const builder = new TransactionBuilder(client, wallet)
    .to(recipient)
    .value(transferValue)
    .chainId(chainId)
    .withGasEstimate()
    .withGasPrice('medium');

  const transactionRequest = await builder.build();
  console.log(`  To: ${transactionRequest.to.checksum}`);
  console.log(`  Value: ${transactionRequest.value.human} ETH`);
  console.log(
    `  Estimated Gas: ${transactionRequest.gasLimit?.toString() ?? 'n/a'}`,
  );
  console.log(
    `  Max Fee: ${transactionRequest.maxFeePerGas ? formatUnits(transactionRequest.maxFeePerGas, 'gwei') : 'n/a'} gwei`,
  );
  console.log(
    `  Max Priority: ${transactionRequest.maxPriorityFee ? formatUnits(transactionRequest.maxPriorityFee, 'gwei') : 'n/a'} gwei`,
  );

  step('5. Sign transaction');
  const signed = await wallet.signTransaction(transactionRequest.toWeb3());
  const parsed = Transaction.from(signed.rawTransaction);
  const recoveredAddress = parsed.from ? getAddress(parsed.from) : null;
  const expectedAddress = getAddress(wallet.address);
  const signatureValid = recoveredAddress === expectedAddress;

  console.log(`  Signature valid: ${signatureValid ? '✓' : '✗'}`);
  console.log(`  Recovered address matches: ${signatureValid ? '✓' : '✗'}`);

  if (!signatureValid) {
    throw new Error('Local signature verification failed before broadcast.');
  }

  const broadcast = process.env.INTEGRATION_BROADCAST !== 'false';
  if (!broadcast) {
    step('6. Dry-run eth_call simulation');
    const simulation = await client.call(transactionRequest, 'latest');
    const simulationHex = typeof simulation === 'string' ? simulation : '0x';
    console.log(`  Simulation result: ${simulationHex}`);
    console.log('\nIntegration dry-run PASSED');
    return;
  }

  step('6. Send transaction');
  const txHash = await client.sendTransaction(signed.rawTransaction);
  console.log(`  TX Hash: ${txHash}`);

  step('7. Wait for confirmation');
  const receipt = await client.waitForReceipt(txHash, 180, 2.0);
  console.log(`  Block: ${receipt.blockNumber}`);
  console.log(`  Status: ${receipt.status ? 'SUCCESS' : 'FAILED'}`);

  step('8. Analyze receipt');
  const gasUsed = receipt.gasUsed;
  const gasLimit = transactionRequest.gasLimit ?? gasUsed;
  const feeEth = formatEther(receipt.txFee.raw);

  console.log(
    `  Gas Used: ${gasUsed.toString()} (${formatPercentage(gasUsed, gasLimit)})`,
  );
  console.log(`  Fee: ${feeEth} ETH`);
  console.log(`  Logs: ${receipt.logs.length}`);

  if (parsed.to) {
    console.log(`  Parsed To: ${getAddress(parsed.to)}`);
  }

  console.log('\nIntegration test PASSED');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nIntegration test FAILED: ${message}`);
    process.exitCode = 1;
  });

function step(label: string): void {
  console.log(`\n${label}`);
}

function formatPercentage(numerator: bigint, denominator: bigint): string {
  if (denominator === 0n) {
    return '0%';
  }

  const basisPoints = (numerator * 10000n) / denominator;
  return `${Number(basisPoints) / 100}%`;
}

function parseRecipient(walletAddress: string): Address {
  const configured = process.env.RECIPIENT_ADDRESS ?? walletAddress;

  return Address.fromString(getAddress(configured));
}
