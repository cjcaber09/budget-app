import { QueryClient } from '@tanstack/react-query';
import { resetClientState } from '../../src/lib/resetClientState';
import { useScanStore } from '../../src/stores/useScanStore';

describe('resetClientState', () => {
  it("drops every cached query and the pending scan image so the next user can't see them", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['ocrScans'], [{ id: 'scan-1' }]);
    useScanStore.getState().setPendingImage({
      uri: 'file:///receipt.jpg',
      base64: 'QUJD',
      mimeType: 'image/jpeg',
      requestId: 'request-1',
    });

    resetClientState(queryClient);

    expect(queryClient.getQueryData(['ocrScans'])).toBeUndefined();
    expect(useScanStore.getState().pendingImage).toBeNull();
  });
});
