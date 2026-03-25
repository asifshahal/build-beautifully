import { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';
import { PoolData, SortField, SortDirection } from '@/lib/types';
import { formatCurrency, formatFeeTvl, formatPercent, formatNumber, formatAge, shortenAddress } from '@/lib/formatters';
import { getLogo, getDefaultLogo } from '@/lib/tokenLogos';
import LoadingSkeleton from './LoadingSkeleton';

interface PoolTableProps {
  pools: PoolData[];
  isLoading: boolean;
}

/**
 * Column definitions.
 * `sortKey` maps to a raw numeric field on PoolData, never a formatted string.
 */
const columns: { key: string; sortKey: SortField | null; label: string }[] = [
  { key: 'pool',          sortKey: null,            label: 'Pool' },
  { key: 'tvl',           sortKey: 'tvl',           label: 'TVL' },
  { key: 'fee_tvl_ratio', sortKey: 'fee_tvl_ratio', label: 'Fee/TVL 30min' },
  { key: 'market_cap',    sortKey: 'mc_sol',        label: 'MC' },
  { key: 'volume_delta',  sortKey: 'volume_delta',  label: '30min VOL' },
  { key: 'fees_delta',    sortKey: 'fees_delta',    label: '30min Fees' },
  { key: 'price_change',  sortKey: 'price_change',  label: 'Price 5m' },
  { key: 'holders',       sortKey: 'holders',       label: 'Holders' },
  { key: 'age',           sortKey: 'age_ms',        label: 'Age' },
  { key: 'actions',       sortKey: null,            label: 'Actions' },
];

/**
 * Sort using raw numeric values only — never formatted strings.
 * Every field is guaranteed to be a number (0 if missing).
 */
function sortPools(pools: PoolData[], field: SortField, dir: SortDirection): PoolData[] {
  return [...pools].sort((a, b) => {
    const aVal = Number(a[field]) || 0;
    const bVal = Number(b[field]) || 0;

    // Nullish values always sort last
    if (aVal === 0 && bVal !== 0) return 1;
    if (bVal === 0 && aVal !== 0) return -1;

    return dir === 'desc' ? bVal - aVal : aVal - bVal;
  });
}

const TokenImg = ({ mint, logo, symbol }: { mint: string; logo: string; symbol: string }) => {
  const src = getLogo(mint, logo || undefined);
  return (
    <img
      src={src}
      alt={symbol}
      className="w-5 h-5 rounded-full object-cover bg-background"
      onError={(e) => { e.currentTarget.src = getDefaultLogo(); }}
    />
  );
};

export default function PoolTable({ pools, isLoading }: PoolTableProps) {
  const [sortField, setSortField] = useState<SortField>('fee_tvl_ratio');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  const sorted = useMemo(
    () => sortPools(pools, sortField, sortDir),
    [pools, sortField, sortDir]
  );

  const handleSort = (sortKey: SortField | null) => {
    if (!sortKey) return;
    if (sortField === sortKey) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(sortKey);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField | null }) => {
    if (!field) return null;
    if (sortField !== field) return <ArrowUpDown size={12} className="text-muted-foreground opacity-40" />;
    return sortDir === 'desc' ? <ArrowDown size={12} className="text-primary" /> : <ArrowUp size={12} className="text-primary" />;
  };

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden animate-fade-in">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.sortKey)}
                  className={`px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap ${
                    col.sortKey ? 'cursor-pointer hover:text-foreground select-none transition-colors' : ''
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortKey && <SortIcon field={col.sortKey} />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && pools.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <LoadingSkeleton />
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-12 text-muted-foreground">
                  No pools found matching your search.
                </td>
              </tr>
            ) : (
              sorted.map((pool, index) => (
                <tr
                  key={pool.pool_address}
                  className={`border-b border-border/50 hover:bg-accent/50 transition-colors duration-100 ${
                    index < 3 ? 'hot-row-border' : ''
                  }`}
                  style={{ minHeight: 52 }}
                >
                  {/* Pool */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-1.5">
                        <div className="z-10">
                          <TokenImg mint={pool.token_a_mint} logo={pool.token_a_logo} symbol={pool.token_a_symbol} />
                        </div>
                        <div className="z-0">
                          <TokenImg mint={pool.token_b_mint} logo={pool.token_b_logo} symbol={pool.token_b_symbol} />
                        </div>
                      </div>
                      <div>
                        <span className="text-foreground font-medium text-sm">
                          {pool.token_a_symbol}-{pool.token_b_symbol}
                        </span>
                        <p className="text-[10px] text-muted-foreground font-mono-numbers">
                          {shortenAddress(pool.pool_address)}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* TVL */}
                  <td className="px-4 py-3 font-mono-numbers text-foreground whitespace-nowrap">
                    {formatCurrency(pool.tvl)}
                  </td>

                  {/* Fee/TVL */}
                  <td className="px-4 py-3 font-mono-numbers text-primary font-medium whitespace-nowrap">
                    {formatFeeTvl(pool.fee_tvl_ratio)}
                  </td>

                  {/* Market Cap */}
                  <td className="px-4 py-3 font-mono-numbers text-foreground whitespace-nowrap">
                    {formatCurrency(pool.market_cap)}
                  </td>

                  {/* 30min Volume */}
                  <td className="px-4 py-3 font-mono-numbers text-foreground whitespace-nowrap">
                    {formatCurrency(pool.volume_30min || pool.volume_delta)}
                  </td>

                  {/* 30min Fees */}
                  <td className="px-4 py-3 font-mono-numbers text-foreground whitespace-nowrap">
                    {formatCurrency(pool.fees_30min || pool.fees_delta)}
                  </td>

                  {/* Price 5m */}
                  <td className="px-4 py-3 font-mono-numbers whitespace-nowrap">
                    {pool.price_change !== null && pool.price_change !== undefined ? (
                      <span className={`flex items-center gap-1 ${pool.price_change >= 0 ? 'text-cit-green' : 'text-cit-red'}`}>
                        {pool.price_change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {formatPercent(pool.price_change)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </td>

                  {/* Holders */}
                  <td className="px-4 py-3 font-mono-numbers text-foreground whitespace-nowrap">
                    {formatNumber(pool.holders)}
                  </td>

                  {/* Age */}
                  <td className="px-4 py-3 font-mono-numbers text-foreground whitespace-nowrap">
                    {formatAge(pool.created_at)}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <a
                        href={`https://dexscreener.com/solana/${pool.pool_address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        title="DexScreener"
                      >
                        <ExternalLink size={14} />
                      </a>
                      <a
                        href={`https://birdeye.so/token/${pool.token_a_mint}?chain=solana`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        title="Birdeye"
                      >
                        <ExternalLink size={14} />
                      </a>
                      <a
                        href={`https://app.meteora.ag/dlmm/${pool.pool_address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        title="Meteora"
                      >
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
