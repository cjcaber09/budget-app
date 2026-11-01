import {useEffect, useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useCategories} from '../hooks/useCategories';
import {usePaymentMethods} from '../hooks/usePaymentMethods';
import {useIncomeSources} from '../hooks/useIncomeSources';
import {usePreferencesStore, type Profile} from '../stores/usePreferencesStore';
import {saveOfflineDraftChoices, offlineChoicesGeneration} from '../lib/offlineDraftChoicesStorage';

export function OfflineDraftBootstrap() {
  const owner = usePreferencesStore(s => s.profile?.user_id);
  return owner ? <CaptureChoices key={owner} owner={owner}/> : null;
}
function CaptureChoices({owner}: {owner: string}) {
  const categories = useCategories(), methods = usePaymentMethods(), sources = useIncomeSources();
  const profile = usePreferencesStore(s => s.profile), client = useQueryClient();
  const [generation] = useState(() => offlineChoicesGeneration(owner));
  useEffect(() => {
    // Only use a server-loaded profile and fully successful owner-checked reads.
    const verified = client.getQueryData<Profile>(['profile', owner]);
    if (!verified || verified !== profile || !categories.isSuccess || categories.isFetching || !methods.isSuccess || methods.isFetching || !methods.methods || !sources.isSuccess || sources.isFetching) return;
    void saveOfflineDraftChoices({version:1,owner,savedAt:new Date().toISOString(),currency:verified.currency,timezone:verified.timezone,dateFormat:verified.date_format,categories:categories.data,methods:methods.methods,sources:sources.data}, generation).catch(() => {/* The form reports local storage failures; online operation remains available. */});
  }, [owner,profile,client,categories.data,categories.isSuccess,categories.isFetching,methods.methods,methods.isSuccess,methods.isFetching,sources.data,sources.isSuccess,sources.isFetching,generation]);
  return null;
}
