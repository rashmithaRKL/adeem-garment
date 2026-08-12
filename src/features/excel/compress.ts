import { zip, unzip } from 'fflate';

/**
 * Compression must be lossless: the archive holds the original bytes under the
 * original filename, so the download restores an identical .xlsx.
 */
export async function compressWorkbook(file: File): Promise<Uint8Array> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return new Promise((resolve, reject) => {
    zip({ [file.name]: bytes }, { level: 9 }, (err, data) => {
      if (err) reject(err); else resolve(data);
    });
  });
}

export async function decompressWorkbook(
  archive: Uint8Array
): Promise<{ filename: string; bytes: Uint8Array }> {
  return new Promise((resolve, reject) => {
    unzip(archive, (err, files) => {
      if (err) return reject(err);
      const entry = Object.entries(files)[0];
      if (!entry) return reject(new Error('The archive is empty.'));
      resolve({ filename: entry[0], bytes: entry[1] });
    });
  });
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Saves a restored workbook to disk under its original name. */
export function saveBlob(bytes: Uint8Array, filename: string): void {
  // Copy into a plain ArrayBuffer: fflate may hand back a view over a pooled or
  // shared buffer, which Blob will not accept.
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  const url = URL.createObjectURL(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Firefox cancels the download if the URL is revoked in the same tick.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
