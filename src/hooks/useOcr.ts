import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { formatOcrLimitMessage } from '../domain/ocr';
import {
  OCR_BUCKET,
  ocrScanPath,
  type OcrLimitReason,
  type OcrScanResult,
} from '../../supabase/functions/ocr/shared';

const OCR_TIMEOUT_MS = 30_000;
const GENERIC_SCAN_ERROR = "Couldn't read text from that image.";

export interface OcrScanRow {
  id: string;
  user_id: string;
  char_count: number | null;
  created_at: string;
}

export class OcrRequestError extends Error {
  retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'OcrRequestError';
    this.retryable = retryable;
  }
}

// Thrown messages surface through the global MutationCache.onError toast in app/_layout.tsx.
export async function mapOcrInvokeError(error: unknown): Promise<OcrRequestError> {
  if (error instanceof FunctionsHttpError) {
    const status = error.context?.status;
    if (status === 429) {
      const body = (await error.context.json().catch(() => null)) as {
        reason?: OcrLimitReason;
        retryAfterSeconds?: number;
      } | null;
      if (body?.reason && typeof body.retryAfterSeconds === 'number') {
        return new OcrRequestError(formatOcrLimitMessage(body.reason, body.retryAfterSeconds), false);
      }
    }
    if (status === 409) return new OcrRequestError('Still reading that receipt — one moment.', true);
    if (status === 410) return new OcrRequestError('That scan was deleted.', false);
    return new OcrRequestError(GENERIC_SCAN_ERROR, false);
  }
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    return new OcrRequestError("Couldn't reach the scanner. Check your connection and try again.", true);
  }
  return new OcrRequestError(GENERIC_SCAN_ERROR, false);
}

// One automatic retry for transient failures. Safe because every attempt carries the
// same requestId: the server replays a finished scan instead of calling Vision again.
export function shouldRetryOcrScan(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && (error as { retryable?: unknown } | null)?.retryable === true;
}

export function useOcrScan(shouldNotify?: () => boolean) {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { shouldNotify },
    mutationFn: async ({
      base64,
      mimeType,
      requestId,
    }: {
      base64: string;
      mimeType: string;
      requestId: string;
    }): Promise<OcrScanResult> => {
      const { data, error } = await supabase.functions.invoke<OcrScanResult>('ocr', {
        body: { imageBase64: base64, mimeType, requestId, receiptSchemaVersion: 2 },
        timeout: OCR_TIMEOUT_MS,
      });
      if (error) throw await mapOcrInvokeError(error);
      if (!data) throw new OcrRequestError(GENERIC_SCAN_ERROR, false);
      return data;
    },
    retry: shouldRetryOcrScan,
    retryDelay: 1500,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ocrScans'] }),
  });
}

export function useOcrScans() {
  return useQuery({
    queryKey: ['ocrScans'],
    queryFn: async (): Promise<OcrScanRow[]> => {
      const { data, error } = await supabase
        .from('ocr_scans')
        .select('id, user_id, char_count, created_at')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });
}

export function useDeleteOcrScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scanId: string) => {
      const { error } = await supabase.functions.invoke('ocr', { method: 'DELETE', body: { scanId } });
      if (error) throw new Error("Couldn't delete that scan.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ocrScans'] }),
  });
}

export async function getOcrDownloadUrl(scan: OcrScanRow): Promise<string> {
  const { data, error } = await supabase.storage
    .from(OCR_BUCKET)
    .createSignedUrl(ocrScanPath(scan.user_id, scan.id), 60, {
      download: `receipt-${scan.created_at.slice(0, 10)}.txt`,
    });
  if (error) throw error;
  return data.signedUrl;
}
