import { WalletManager } from '@/core/wallet';

async function main(): Promise<void> {
  const wallet = WalletManager.generate(true);
  console.log('New wallet:', wallet);
}

main().catch((err) => {
  console.error(
    'Fatal error:',
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});

export {};
