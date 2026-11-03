import type {QueryClient} from '@tanstack/react-query';
export function invalidateReports(client:QueryClient) {
 for(const queryKey of [['reports'],['reportTransfers'],['reportTransactions'],['overviewHighlights'],['activityBalances']])void client.invalidateQueries({queryKey});
}
