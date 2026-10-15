import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { usePaymentMethods, useSavePaymentMethod } from '../hooks/usePaymentMethods';
import { usePreferencesStore } from '../stores/usePreferencesStore';
import type { PaymentMethod, PaymentMethodValues } from '../domain/paymentMethods';
import { useFormStyles } from '../styles/forms';
import { PaymentMethodForm } from './PaymentMethodForm';
import { SheetLayer } from './KeyboardSheet';
import { MotionPressable } from './MotionPressable';
import {useUpdateBlocker} from '../stores/useUpdateSafetyStore';

export type AccountChoice = Pick<PaymentMethod, 'id' | 'user_id' | 'method' | 'name' | 'payment_type' | 'last_four' | 'archived'>;

export function TransferMethodCreation({ owner, open, active, onClose, onCreated }: {
  owner: string; open: boolean; active: boolean; onClose: (reset?: boolean) => void; onCreated: (method: AccountChoice) => void;
}) {
  const form = useFormStyles(), query = usePaymentMethods(), save = useSavePaymentMethod();
  const [pending, setPending] = useState<PaymentMethodValues | null>(null);
  const [confirmed, setConfirmed] = useState(false), [refreshing, setRefreshing] = useState(false), [error, setError] = useState('');
  const live = useRef(false), running = useRef(false);
  useEffect(() => { live.current = active && open; return () => { live.current = false; }; }, [active, open]);
  const valid = () => live.current && usePreferencesStore.getState().profile?.user_id === owner;
  async function refresh() {
    setRefreshing(true);
    try {
      const result = await query.refetch();
      if (!valid()) return;
      if (result.isError || result.data?.owner !== owner) throw new Error();
      onClose(true);
    } catch { if (valid()) setError('Payment method saved. Retry refreshing accounts; it will not be created again.'); }
    finally { if (valid()) setRefreshing(false); }
  }
  async function submit(values: PaymentMethodValues) {
    if (running.current || !valid()) return;
    running.current = true; setPending(values); setError('');
    try {
      const method = await save.mutateAsync({ ...values, operation: 'create' });
      if (!valid() || method.user_id !== owner) return;
      // This is label metadata, never a computed balance snapshot.
      onCreated(method); setConfirmed(true); await refresh();
    } catch (issue) { if (valid()) {
      if (issue instanceof Error && 'rejected' in issue) { setPending(null); setError(issue.message); }
      else setError('Could not confirm the save. Retry the same payment method to safely confirm it.');
    } }
    finally { running.current = false; }
  }
  const busy = save.isPending || refreshing;
  useUpdateBlocker(busy||!!pending&&!confirmed);
  const close = () => onClose(!pending || confirmed);
  return <View>
    {/* Keeping the form mounted retains its UUID and draft through retries/close. */}
    {open && active && <SheetLayer title="Add payment method" busy={busy} onClose={close}>
      <View style={{ display: pending ? 'none' : 'flex' }}><PaymentMethodForm submitting={busy} error={error} onCancel={close} onSave={values => void submit({ ...values })} /></View>
      {pending && <View style={{ gap: 12 }}>
        <Text style={form.subtitle}>{confirmed ? `${pending.name} is saved.` : `Confirming ${pending.name}. The exact request is kept for retry.`}</Text>
        {!!error && <Text accessibilityRole="alert" style={form.error}>{error}</Text>}
        <MotionPressable disabled={busy} style={form.button} onPress={() => { if (confirmed) void refresh(); else void submit(pending); }}><Text style={form.buttonText}>{busy ? 'Saving…' : confirmed ? 'Retry refreshing accounts' : 'Retry same payment method'}</Text></MotionPressable>
        <MotionPressable disabled={busy} style={form.secondaryButton} onPress={close}><Text style={form.chipTextSelected}>Back to transfer</Text></MotionPressable>
      </View>}
    </SheetLayer>}
  </View>;
}
