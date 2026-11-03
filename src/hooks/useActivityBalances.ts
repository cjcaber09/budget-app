import {useEffect, useState} from 'react';
import {AppState} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import {supabase} from '../lib/supabase';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {localDateKey} from '../domain/transactionDates';
import {balanceActivityKey, decodeActivityBalances, type BalanceActivity} from '../domain/activityBalances';
import {isUuid} from '../../supabase/functions/ocr/shared';

export function useActivityBalances(entries: BalanceActivity[]) {
  const profile = usePreferencesStore(s => s.profile);
  const [clock, setClock] = useState(() => Date.now());
  const owner = profile?.user_id, timezone = profile?.timezone;
  const today = localDateKey(new Date(clock), timezone);
  const signature = [...new Set(entries.filter(e => isUuid(e.id)).map(balanceActivityKey))].sort().join(',');
  const query = useQuery({
    queryKey: ['activityBalances', owner, timezone, today, signature],
    enabled: !!owner && !!timezone && !!signature,
    meta: {shouldNotify: () => false},
    refetchOnMount: 'always',
    queryFn: async ({signal}) => {
      const requested = signature.split(',').map(key => {const [kind, id] = key.split(':'); return {kind, id} as BalanceActivity;});
      const rows = [];
      for (let i = 0; i < requested.length; i += 100) {
        const batch = requested.slice(i, i + 100);
        const {data, error} = await supabase.rpc('activity_balance_history', {p_entries: batch}).abortSignal(signal);
        if (error) throw new Error(error.code === 'PGRST202' ? 'Balance history needs the latest server update.' : 'Could not refresh account balance history. Retry.');
        rows.push(...decodeActivityBalances(data, {owner: owner!, timezone: timezone!, today}, batch));
      }
      return new Map(rows.map(row => [balanceActivityKey(row), row]));
    },
  });
  const refetch = query.refetch;
  useEffect(() => {
    if (!owner || !signature) return;
    let day = today;
    const sync = () => {const now=Date.now();setClock(now);if(localDateKey(new Date(now),timezone)===today)void refetch();};
    const listener = AppState.addEventListener('change', state => {if (state === 'active') sync();});
    const timer = setInterval(() => {const next = localDateKey(new Date(), timezone); if (next !== day) {day = next; sync();}}, 30000);
    return () => {clearInterval(timer); listener.remove();};
  }, [owner, signature, timezone, today, refetch]);
  return query;
}
