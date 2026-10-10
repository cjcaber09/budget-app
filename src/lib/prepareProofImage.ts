import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

const MAX_EDGE = 2000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface PreparedProofImage {
  bytes: Uint8Array;
  name: string;
  mime: 'image/webp';
}

export function isWebP(bytes: Uint8Array): boolean {
  return bytes.length >= 12 &&
    bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 &&
    bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80;
}

// Encode locally. Only these bytes, never the selected original, may be uploaded.
export async function prepareProofImage(uri: string, originalName: string): Promise<PreparedProofImage> {
  const context = ImageManipulator.manipulate(uri);
  const original = await context.renderAsync();
  if (original.width > MAX_EDGE || original.height > MAX_EDGE) {
    context.resize(original.width >= original.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ format: SaveFormat.WEBP, compress: 0.8 });
  const bytes = Platform.OS === 'web'
    ? new Uint8Array(await (await fetch(result.uri)).arrayBuffer())
    : await new File(result.uri).bytes();
  // Some browsers silently fall back to PNG when an encoder is unavailable.
  if (!isWebP(bytes)) throw new Error('This device could not create a WebP image.');
  if (bytes.length > MAX_FILE_BYTES) throw new Error('The compressed image exceeds 10 MB.');
  const stem = originalName.replace(/\.[^.]+$/, '').replace(/[\u0000-\u001f/\\]/g, '').trim().slice(0, 150) || 'Receipt';
  return { bytes, name: `${stem}.webp`, mime: 'image/webp' };
}
