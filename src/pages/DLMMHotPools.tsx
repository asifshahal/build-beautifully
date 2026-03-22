import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import FilterBar from '@/components/FilterBar';
import PoolTable from '@/components/PoolTable';
import RefreshTimer from '@/components/RefreshTimer';
import { fetchDLMMPools } from '@/lib/meteora';
import { PoolData } from '@/lib/types';

export default function DLMMHotPools() {
  const [pools, setPools] = useState<PoolData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [, setTick] = useState(0);

  const searchQuery = searchParams.get('search') || '';

  const setSearchQuery = (q: string) => {
    if (q) {
      setSearchParams({ search: q });
    } else {
      setSearchParams({});
    }
  };

  const loadPools = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await fetchDLMMPools();
      setPools(data);
      setLastUpdated(Date.now());
      setError(null);
    } catch (e) {
      console.error('Failed to fetch DLMM pools:', e);
      if (pools.length === 0) {
        setError('Failed to load pool data. Retrying...');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPools();
    const interval = setInterval(loadPools, 30_000);
    return () => clearInterval(interval);
  }, [loadPools]);

  // Update timer display
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const filtered = useMemo(() => {
    if (!searchQuery) return pools;
    const q = searchQuery.toLowerCase();
    return pools.filter(
      (p) =>
        p.token_a_symbol.toLowerCase().includes(q) ||
        p.token_b_symbol.toLowerCase().includes(q) ||
        p.pool_address.toLowerCase().includes(q)
    );
  }, [pools, searchQuery]);

  const isFresh = lastUpdated ? Date.now() - lastUpdated < 30_000 : false;

  return (
    <AppLayout title="DLMM Hot Pools" subtitle="Sorted by Fee/TVL ratio · 30-minute rolling window">
      {error && pools.length === 0 && (
        <div className="bg-primary/10 border border-primary/30 rounded-lg px-4 py-3 mb-4 text-sm text-primary">
          ⚠ {error}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex-1">
          <FilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            poolCount={filtered.length}
          />
        </div>
        <div className="ml-4">
          <RefreshTimer lastUpdated={lastUpdated} isFresh={isFresh} />
        </div>
      </div>

      {isLoading && pools.length > 0 && (
        <div className="h-0.5 bg-primary/20 rounded-full overflow-hidden mb-4">
          <div className="h-full bg-primary animate-shimmer" style={{ width: '40%', backgroundImage: 'linear-gradient(90deg, transparent 0%, hsl(var(--primary)) 50%, transparent 100%)', backgroundSize: '200% 100%' }} />
        </div>
      )}

      <PoolTable pools={filtered} isLoading={isLoading} />
    </AppLayout>
  );
}
