import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { PreparedScanImage } from '../stores/useScanStore';

// Plenty for receipt text (Google suggests ~1024px for text detection). Vision
// bills per image, not per byte, so this is about a small, fast upload.
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.6;

// Normalizes whatever the picker returned (HEIC, PNG, huge camera JPEGs) into a
// bounded JPEG the OCR function accepts.
export async function prepareScanImage(source: {
  uri: string;
  width: number;
  height: number;
}): Promise<PreparedScanImage> {
  const context = ImageManipulator.manipulate(source.uri);
  if (source.width > MAX_EDGE || source.height > MAX_EDGE) {
    context.resize(source.width >= source.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY, base64: true });
  if (!result.base64) throw new Error('Could not encode the image.');
  return { uri: result.uri, base64: result.base64, mimeType: 'image/jpeg' };
}
