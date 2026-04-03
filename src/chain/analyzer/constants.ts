export const ANALYZER_USAGE =
  'Usage: tsx src/chain/analyzer/entry.ts <tx_hash> [--rpc URL] [--format text|json] [--no-trace] [--no-mev]';

export const DEFAULT_RPC =
  process.env.RPC_URL || 'https://ethereum.publicnode.com';

export const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

export const UNISWAP_V2_ROUTER_ABI = [
  'function swapExactTokensForTokens(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline)',
  'function swapExactETHForTokens(uint256 amountOutMin,address[] path,address to,uint256 deadline) payable',
  'function swapTokensForExactTokens(uint256 amountOut,uint256 amountInMax,address[] path,address to,uint256 deadline)',
  'function addLiquidity(address tokenA,address tokenB,uint256 amountADesired,uint256 amountBDesired,uint256 amountAMin,uint256 amountBMin,address to,uint256 deadline)',
  'function removeLiquidity(address tokenA,address tokenB,uint256 liquidity,uint256 amountAMin,uint256 amountBMin,address to,uint256 deadline)',
];

export const UNISWAP_V3_ROUTER_ABI = [
  'function multicall(bytes[] data)',
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)',
  'function exactInput((bytes path,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum) params) payable returns (uint256 amountOut)',
  'function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountIn)',
  'function exactOutput((bytes path,address recipient,uint256 deadline,uint256 amountOut,uint256 amountInMaximum) params) payable returns (uint256 amountIn)',
];

export const ERC20_FUNCTIONS_ABI = [
  'function transfer(address to,uint256 amount)',
  'function approve(address spender,uint256 amount)',
  'function transferFrom(address from,address to,uint256 amount)',
];

export const PAIR_EVENTS_ABI = [
  'event Swap(address indexed sender,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out,address indexed to)',
  'event Sync(uint112 reserve0,uint112 reserve1)',
];

export const UNISWAP_V3_POOL_EVENTS_ABI = [
  'event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)',
];
