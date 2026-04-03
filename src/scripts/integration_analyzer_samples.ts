import 'dotenv/config';

import { JsonRpcProvider } from 'ethers';

import { printText } from '@/chain/analyzer/output';
import { analyzeTransaction } from '@/chain/analyzer/service';

type SampleCase = {
  label: string;
  hash: string;
  expectedStatus?: 'SUCCESS' | 'FAILED' | 'PENDING';
};

const RPC_URL =
  process.env.ANALYZER_RPC_URL || 'https://ethereum.publicnode.com';

const SAMPLE_CASES: SampleCase[] = [
  {
    label: 'Simple ETH transfer',
    hash: '0xb5c8bd9430b6cc87a0e2fe110ece6bf527fa4f170a4bc8cd032f768fc5219838',
    expectedStatus: 'SUCCESS',
  },
  {
    label: 'Uniswap V2 swap',
    hash: '0xaf6e8e358b9d93ead36b5852c4ebb9127fa88e3f7753f73d8a3f74a552601742',
    expectedStatus: 'SUCCESS',
  },
  {
    label: 'Failed transaction',
    hash: '0xc5178498b5c226d9f7e2f5086f72bf0e4f4d87e097c4e517f1bec128580fd537',
    expectedStatus: 'FAILED',
  },
  {
    label: 'Complex multicall',
    hash: '0x58baef119f9ccfdea7288b43d0153347837f673f9902dfc0b8ac1d0f6b1ed0ff',
  },
];

async function main(): Promise<void> {
  const provider = new JsonRpcProvider(RPC_URL);

  console.log('Analyzer sample integration test');

  let decodedCount = 0;
  let transferRichCount = 0;

  for (const sample of SAMPLE_CASES) {
    console.log(`\n- ${sample.label}`);
    const result = await analyzeTransaction(provider, sample.hash, {
      trace: false,
      mev: false,
    });

    assert(result.hash === sample.hash, `Hash mismatch for ${sample.label}`);
    assert(
      result.status === 'SUCCESS' ||
        result.status === 'FAILED' ||
        result.status === 'PENDING',
      `Unexpected status for ${sample.label}: ${result.status}`,
    );

    if (sample.expectedStatus) {
      assert(
        result.status === sample.expectedStatus,
        `${sample.label} expected status ${sample.expectedStatus}, got ${result.status}`,
      );
    }

    const signature = result.functionCall.signature;
    if (signature !== 'Unknown') {
      decodedCount++;
    }

    if (result.transfers.length > 0) {
      transferRichCount++;
    }

    printText(result);
    console.log(
      '\n===================================================================================',
    );
    console.log(
      '===================================================================================',
    );
    console.log(
      '===================================================================================\n',
    );
  }

  assert(
    decodedCount >= 2,
    'Expected at least 2 known function decodes across samples.',
  );
  assert(
    transferRichCount >= 1,
    'Expected at least 1 sample with token transfers.',
  );

  console.log('\nAnalyzer sample integration test PASSED');
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nAnalyzer sample integration test FAILED: ${message}`);
    process.exitCode = 1;
  });

export {};
