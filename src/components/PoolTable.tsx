import { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';
import { PoolData, SortField, SortDirection } from '@/lib/types';
import { formatCurrency, formatFeeTvl, formatPercent, formatNumber, formatAge, shortenAddress } from '@/lib/formatters';
import TokenLogo from './TokenLogo';
import LoadingSkeleton from './LoadingSkeleton';

interface PoolTableProps {
  pools: PoolData[];
  isLoading: boolean;
}

const columns: { key: SortField | 'pool' | 'actions'; label: string; sortable: boolean }[] = [
  { key: 'pool', label: 'Pool', sortable: false },
  { key: 'tvl', label: 'TVL', sortable: true },
  { key: 'fee_tvl_ratio', label: 'Fee/TVL 30min', sortable: true },
  { key: 'market_cap', label: 'MC', sortable: true },
  { key: 'volume_delta', label: '30min VOL', sortable: true },
  { key: 'fees_delta', label: '30min Fees', sortable: true },
  { key: 'price_change', label: 'Price 5m', sortable: true },
  { key: 'holders', label: 'Holders', sortable: true },
  { key: 'created_at', label: 'Age', sortable: true },
  { key: 'actions', label: 'Actions', sortable: false },
];

export default function PoolTable({ pools, isLoading }: PoolTableProps) {
  const [sortField, setSortField] = useState<SortField>('fee_tvl_ratio');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  const sorted = useMemo(() => {
    return [...pools].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (sortField === 'created_at') {
        const aTime = new Date(aVal as string).getTime();
        const bTime = new Date(bVal as string).getTime();
        return sortDir === 'desc' ? bTime - aTime : aTime - bTime;
      }
      return sortDir === 'desc'
        ? (bVal as number) - (aVal as number)
        : (aVal as number) - (bVal as number);
    });
  }, [pools, sortField, sortDir]);

  const handleSort = (field: string) => {
    if (field === 'pool' || field === 'actions') return;
    const f = field as SortField;
    if (sortField === f) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(f);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (field === 'pool' || field === 'actions') return null;
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
                  onClick={() => col.sortable && handleSort(col.key)}
                  className={`px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap ${
                    col.sortable ? 'cursor-pointer hover:text-foreground select-none transition-colors' : ''
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && <SortIcon field={col.key} />}
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
                        <TokenLogo src={pool.token_a_logo} symbol={pool.token_a_symbol} />
                        <TokenLogo src={pool.token_b_logo} symbol={pool.token_b_symbol} />
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
                    {formatCurrency(pool.volume_delta ?? pool.volume_30min)}
                  </td>

                  {/* 30min Fees */}
                  <td className="px-4 py-3 font-mono-numbers text-foreground whitespace-nowrap">
                    {formatCurrency(pool.fees_30min)}
                  </td>

                  {/* Price 5m */}
                  <td className="px-4 py-3 font-mono-numbers whitespace-nowrap">
                    {pool.price_change_5m !== null ? (
                      <span className={`flex items-center gap-1 ${pool.price_change_5m >= 0 ? 'text-cit-green' : 'text-cit-red'}`}>
                        {pool.price_change_5m >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {formatPercent(pool.price_change_5m)}
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
