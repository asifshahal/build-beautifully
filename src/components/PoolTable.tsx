import { useState, useMemo, useCallback } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';
import { PoolData, SortField, SortDirection } from '@/lib/types';
import { formatCurrency, formatPercent, formatAge, shortenAddress, formatMarketCapUsd } from '@/lib/formatters';
import { getLogo, getDefaultLogo, markLogoFailed } from '@/lib/tokenLogos';
import { useIsMobile } from '@/hooks/use-mobile';
import LoadingSkeleton from './LoadingSkeleton';

interface PoolTableProps {
  pools: PoolData[];
  isLoading: boolean;
}

// ─── Columns ─────────────────────────────────────────────────────────────────

const columns: { key: string; sortKey: SortField | null; label: string }[] = [
  { key: 'pool',           sortKey: null,               label: 'Token' },
  { key: 'marketcap',      sortKey: 'marketCapUsd',           label: 'Marketcap' },
  { key: 'price_1h',       sortKey: 'price_change_1h',  label: '1h %' },
  { key: 'price_24h',      sortKey: 'price_change_24h', label: '24h %' },
  { key: 'tvl',            sortKey: 'tvl',              label: 'Liquidity' },
  { key: 'volume_24h',     sortKey: 'volume_24h',       label: 'Volume 24h' },
  { key: 'fees_24h',       sortKey: 'fees_24h',         label: 'Fees 24h' },
  { key: 'age',            sortKey: 'age_ms',           label: 'Pool Age' },
  { key: 'fee_tvl_ratio',  sortKey: 'fee_tvl_ratio',    label: 'Health' },
  { key: 'actions',        sortKey: null,               label: 'Links' },
];

// ─── Sort ────────────────────────────────────────────────────────────────────

function sortPools(pools: PoolData[], field: SortField, dir: SortDirection): PoolData[] {
  return [...pools].sort((a, b) => {
    const aVal = Number(a[field]) || 0;
    const bVal = Number(b[field]) || 0;
    if (aVal === 0 && bVal !== 0) return 1;
    if (bVal === 0 && aVal !== 0) return -1;
    return dir === 'desc' ? bVal - aVal : aVal - bVal;
  });
}

// ─── Token Image ─────────────────────────────────────────────────────────────

const TokenImg = ({ mint, logo, symbol }: { mint: string; logo: string; symbol: string }) => {
  const src = getLogo(mint, logo || undefined);
  return (
    <img
      src={src}
      alt={symbol}
      className="w-5 h-5 rounded-full object-cover bg-background"
      loading="lazy"
      onError={(e) => {
        markLogoFailed(e.currentTarget.src, mint);
        e.currentTarget.src = getDefaultLogo();
      }}
    />
  );
};

// ─── Price Change Cell ───────────────────────────────────────────────────────

function PriceChangeCell({ value }: { value: number | null }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className={`flex items-center gap-1 ${value >= 0 ? 'text-cit-green' : 'text-cit-red'}`}>
      {value >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {formatPercent(value)}
    </span>
  );
}

// ─── External Links ──────────────────────────────────────────────────────────

function PoolLinks({ pool }: { pool: PoolData }) {
  return (
    <div className="flex items-center gap-1.5">
      <a href={`https://app.meteora.ag/dlmm/${pool.pool_address}`} target="_blank" rel="noopener noreferrer"
        className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Meteora">
        <ExternalLink size={14} />
      </a>
      <a href={`https://gmgn.ai/sol/token/${pool.token_mint}`} target="_blank" rel="noopener noreferrer"
        className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="GMGN">
        <ExternalLink size={14} />
      </a>
      <a href={`https://dexscreener.com/solana/${pool.token_mint}`} target="_blank" rel="noopener noreferrer"
        className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="DexScreener">
        <ExternalLink size={14} />
      </a>
    </div>
  );
}

// ─── Mobile Card ─────────────────────────────────────────────────────────────

function PoolCard({ pool, index }: { pool: PoolData; index: number }) {
  return (
    <div className={`bg-card border border-border rounded-lg p-4 ${index < 3 ? 'hot-row-border' : ''}`}>
      {/* Header: token + price */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1.5">
            <div className="z-10"><TokenImg mint={pool.token_a_mint} logo={pool.token_a_logo} symbol={pool.token_a_symbol} /></div>
            <div className="z-0"><TokenImg mint={pool.token_b_mint} logo={pool.token_b_logo} symbol={pool.token_b_symbol} /></div>
          </div>
          <div>
            <span className="text-foreground font-medium text-sm">{pool.token_a_symbol}-{pool.token_b_symbol}</span>
            <p className="text-[10px] text-muted-foreground font-mono-numbers">{shortenAddress(pool.pool_address)}</p>
          </div>
        </div>
        <span className="font-mono-numbers text-foreground text-sm">{formatMarketCapUsd(pool.marketCapUsd)}</span>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div>
          <span className="text-muted-foreground">1h</span>
          <div className="font-mono-numbers"><PriceChangeCell value={pool.price_change_1h} /></div>
        </div>
        <div>
          <span className="text-muted-foreground">24h</span>
          <div className="font-mono-numbers"><PriceChangeCell value={pool.price_change_24h} /></div>
        </div>
        <div>
          <span className="text-muted-foreground">Liquidity</span>
          <div className="font-mono-numbers text-foreground">{formatCurrency(pool.tvl)}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Volume 24h</span>
          <div className="font-mono-numbers text-foreground">{formatCurrency(pool.volume_24h)}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Fees 24h</span>
          <div className="font-mono-numbers text-foreground">{formatCurrency(pool.fees_24h)}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Age</span>
          <div className="font-mono-numbers text-foreground">{formatAge(pool.created_at)}</div>
        </div>
      </div>

      {/* Links */}
      <div className="flex gap-2">
        <a href={`https://app.meteora.ag/dlmm/${pool.pool_address}`} target="_blank" rel="noopener noreferrer"
          className="flex-1 text-center py-1.5 rounded bg-muted text-xs text-muted-foreground hover:text-foreground transition-colors">
          Meteora
        </a>
        <a href={`https://gmgn.ai/sol/token/${pool.token_mint}`} target="_blank" rel="noopener noreferrer"
          className="flex-1 text-center py-1.5 rounded bg-muted text-xs text-muted-foreground hover:text-foreground transition-colors">
          GMGN
        </a>
        <a href={`https://dexscreener.com/solana/${pool.token_mint}`} target="_blank" rel="noopener noreferrer"
          className="flex-1 text-center py-1.5 rounded bg-muted text-xs text-muted-foreground hover:text-foreground transition-colors">
          Dex
        </a>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function PoolTable({ pools, isLoading }: PoolTableProps) {
  const [sortField, setSortField] = useState<SortField>('fee_tvl_ratio');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const isMobile = useIsMobile();

  const sorted = useMemo(() => sortPools(pools, sortField, sortDir), [pools, sortField, sortDir]);

  const handleSort = useCallback((sortKey: SortField | null) => {
    if (!sortKey) return;
    if (sortField === sortKey) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(sortKey);
      setSortDir('desc');
    }
  }, [sortField]);

  const SortIcon = ({ field }: { field: SortField | null }) => {
    if (!field) return null;
    if (sortField !== field) return <ArrowUpDown size={12} className="text-muted-foreground opacity-40" />;
    return sortDir === 'desc' ? <ArrowDown size={12} className="text-primary" /> : <ArrowUp size={12} className="text-primary" />;
  };

  // Loading
  if (isLoading && pools.length === 0) {
    return <div className="bg-card border border-border rounded-lg overflow-hidden animate-fade-in"><LoadingSkeleton /></div>;
  }

  // Empty
  if (sorted.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground animate-fade-in">
        No pools found matching your search.
      </div>
    );
  }

  // Mobile: card layout
  if (isMobile) {
    return (
      <div className="flex flex-col gap-3 animate-fade-in w-full">
        {/* Mobile Sorting Controls */}
        <div className="flex items-center gap-2 mb-1 px-1">
          <select
            value={sortField || ''}
            onChange={(e) => {
              setSortField(e.target.value as SortField);
              setSortDir('desc');
            }}
            className="bg-secondary text-foreground text-sm rounded-md px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-primary flex-1 appearance-none"
            style={{ backgroundImage: `url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23888%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right .7rem top 50%', backgroundSize: '.65rem auto' }}
          >
            <option value="marketCapUsd">Marketcap</option>
            <option value="tvl">Liquidity</option>
            <option value="volume_24h">Volume 24h</option>
            <option value="fees_24h">Fees 24h</option>
            <option value="age_ms">Pool Age</option>
            <option value="fee_tvl_ratio">Health</option>
            <option value="price_change_1h">1h %</option>
            <option value="price_change_24h">24h %</option>
          </select>
          <button
            onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
            className="bg-secondary text-foreground px-3 py-2 rounded-md border border-border flex items-center justify-center gap-1.5 hover:bg-accent transition-colors min-w-[80px]"
          >
            {sortDir === 'desc' ? <ArrowDown size={14} className="text-primary" /> : <ArrowUp size={14} className="text-primary" />}
            <span className="text-sm font-medium">{sortDir === 'desc' ? 'DESC' : 'ASC'}</span>
          </button>
        </div>

        {sorted.map((pool, i) => (
          <PoolCard key={pool.pool_address} pool={pool} index={i} />
        ))}
      </div>
    );
  }

  // Desktop: table layout
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
            {sorted.map((pool, index) => (
              <tr
                key={pool.pool_address}
                className={`border-b border-border/50 hover:bg-accent/50 transition-colors duration-100 ${index < 3 ? 'hot-row-border' : ''}`}
              >
                {/* Token */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-1.5">
                      <div className="z-10"><TokenImg mint={pool.token_a_mint} logo={pool.token_a_logo} symbol={pool.token_a_symbol} /></div>
                      <div className="z-0"><TokenImg mint={pool.token_b_mint} logo={pool.token_b_logo} symbol={pool.token_b_symbol} /></div>
                    </div>
                    <div>
                      <span className="text-foreground font-medium text-sm">{pool.token_a_symbol}-{pool.token_b_symbol}</span>
                      <p className="text-[10px] text-muted-foreground font-mono-numbers">{shortenAddress(pool.pool_address)}</p>
                    </div>
                  </div>
                </td>

                {/* Marketcap */}
                <td className="px-4 py-3 font-mono-numbers text-foreground whitespace-nowrap">
                  {formatMarketCapUsd(pool.marketCapUsd)}
                </td>

                {/* 1h % */}
                <td className="px-4 py-3 font-mono-numbers whitespace-nowrap">
                  <PriceChangeCell value={pool.price_change_1h} />
                </td>

                {/* 24h % */}
                <td className="px-4 py-3 font-mono-numbers whitespace-nowrap">
                  <PriceChangeCell value={pool.price_change_24h} />
                </td>

                {/* Liquidity */}
                <td className="px-4 py-3 font-mono-numbers text-foreground whitespace-nowrap">
                  {formatCurrency(pool.tvl)}
                </td>

                {/* Volume 24h */}
                <td className="px-4 py-3 font-mono-numbers text-foreground whitespace-nowrap">
                  {formatCurrency(pool.volume_24h)}
                </td>

                {/* Fees 24h */}
                <td className="px-4 py-3 font-mono-numbers text-foreground whitespace-nowrap">
                  {formatCurrency(pool.fees_24h)}
                </td>

                {/* Pool Age */}
                <td className="px-4 py-3 font-mono-numbers text-foreground whitespace-nowrap">
                  {formatAge(pool.created_at)}
                </td>

                {/* Health (Fee/TVL) */}
                <td className="px-4 py-3 font-mono-numbers text-primary font-medium whitespace-nowrap">
                  {pool.fee_tvl_ratio != null ? `${Math.max(0, Math.min(pool.fee_tvl_ratio, 100)).toFixed(4)}%` : '—'}
                </td>

                {/* Links */}
                <td className="px-4 py-3">
                  <PoolLinks pool={pool} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
