import { PoolData } from './types';

/**
 * Fetch pools from the get-pools edge function (computed 30min metrics).
 * Falls back to direct Meteora API when backend has no data yet.
 */
export async function fetchPoolsFromBackend(poolType: 'dlmm' | 'damm'): Promise<PoolData[]> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !anonKey) throw new Error('Missing Supabase config');

    const res = await fetch(
      `${supabaseUrl}/functions/v1/get-pools?type=${poolType}`,
      {
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
        },
      }
    );

    if (!res.ok) throw new Error(`Edge function error: ${res.status}`);
    const json = await res.json();

    if (json.ok && json.pools && json.pools.length > 0) {
      return json.pools as PoolData[];
    }

    throw new Error('No backend data');
  } catch (err) {
    console.warn('Backend fetch failed, using direct Meteora API:', err);
    const { fetchDLMMPools, fetchDAMMPools } = await import('./meteora');
    return poolType === 'dlmm' ? fetchDLMMPools() : fetchDAMMPools();
  }
}
