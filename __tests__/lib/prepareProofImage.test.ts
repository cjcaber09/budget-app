const mockResize = jest.fn();
const mockSave = jest.fn();
const mockRender = jest.fn();
const mockBytes = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: () => ({ resize: mockResize, renderAsync: mockRender }) },
  SaveFormat: { WEBP: 'webp' },
}));
jest.mock('expo-file-system', () => ({ File: class { bytes = mockBytes; } }));
import { prepareProofImage } from '../../src/lib/prepareProofImage';

const webp = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);
beforeEach(() => {
  jest.clearAllMocks();
  mockRender.mockResolvedValue({ width: 4000, height: 3000, saveAsync: mockSave });
  mockSave.mockResolvedValue({ uri: 'file:///compressed.webp' });
  mockBytes.mockResolvedValue(webp);
});
it('resizes and encodes WebP locally, returning only compressed bytes', async () => {
  const proof = await prepareProofImage('file:///original.jpg', 'receipt.jpg');
  expect(mockResize).toHaveBeenCalledWith({ width: 2000 });
  expect(mockSave).toHaveBeenCalledWith({ format: 'webp', compress: 0.8 });
  expect(proof).toEqual({ bytes: webp, name: 'receipt.webp', mime: 'image/webp' });
});
it('does not enlarge small images', async () => {
  mockRender.mockResolvedValue({ width: 800, height: 600, saveAsync: mockSave });
  await prepareProofImage('file:///small.png', 'small.png');
  expect(mockResize).not.toHaveBeenCalled();
});
it('rejects silent non-WebP encoder fallback instead of mislabeling it', async () => {
  mockBytes.mockResolvedValue(new Uint8Array([137, 80, 78, 71]));
  await expect(prepareProofImage('file:///original.jpg', 'receipt.jpg')).rejects.toThrow('could not create a WebP');
});
