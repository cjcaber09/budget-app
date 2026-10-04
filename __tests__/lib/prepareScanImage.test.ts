const mockResize = jest.fn();
const mockSaveAsync = jest.fn();
const mockRenderAsync = jest.fn(async () => ({ saveAsync: mockSaveAsync }));

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn(() => ({ resize: mockResize, renderAsync: mockRenderAsync })) },
  SaveFormat: { JPEG: 'jpeg' },
}));

import { prepareScanImage } from '../../src/lib/prepareScanImage';

describe('prepareScanImage', () => {
  beforeEach(() => {
    mockResize.mockReset();
    mockSaveAsync.mockReset().mockResolvedValue({ uri: 'file:///out.jpg', base64: 'QUJD', width: 1, height: 1 });
  });

  it('caps the long edge of a landscape image at 1600px', async () => {
    await prepareScanImage({ uri: 'file:///in.jpg', width: 4000, height: 3000 });
    expect(mockResize).toHaveBeenCalledWith({ width: 1600 });
  });

  it('caps the long edge of a portrait image at 1600px', async () => {
    await prepareScanImage({ uri: 'file:///in.jpg', width: 3000, height: 4000 });
    expect(mockResize).toHaveBeenCalledWith({ height: 1600 });
  });

  it('does not upscale small images', async () => {
    await prepareScanImage({ uri: 'file:///in.jpg', width: 800, height: 600 });
    expect(mockResize).not.toHaveBeenCalled();
  });

  it('re-encodes to jpeg and returns base64', async () => {
    const image = await prepareScanImage({ uri: 'file:///in.jpg', width: 800, height: 600 });
    expect(mockSaveAsync).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.6, base64: true });
    expect(image).toEqual({ uri: 'file:///out.jpg', base64: 'QUJD', mimeType: 'image/jpeg' });
  });

  it('throws when no base64 comes back', async () => {
    mockSaveAsync.mockResolvedValue({ uri: 'file:///out.jpg', width: 1, height: 1 });
    await expect(prepareScanImage({ uri: 'file:///in.jpg', width: 800, height: 600 })).rejects.toThrow();
  });
});
