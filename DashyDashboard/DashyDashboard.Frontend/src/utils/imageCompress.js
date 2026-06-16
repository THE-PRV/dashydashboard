// Browser-side screenshot compression. ALL upload paths (single, paste) pass a
// File/Blob through this before hitting the API — the server only validates, it never
// re-encodes. Downscales to <=1600px on the long edge (never upscales) and re-encodes
// as webp at quality 0.75.

const MAX_LONG_EDGE = 1600;
const OUTPUT_TYPE = 'image/webp';
const OUTPUT_QUALITY = 0.75;

/**
 * Compress an image File/Blob: load into an <img>, draw to a canvas downscaled so its
 * long edge is at most MAX_LONG_EDGE (smaller images are left at their original size),
 * then re-encode as webp.
 *
 * @param {Blob} file - the source image (File or Blob).
 * @returns {Promise<Blob>} the compressed webp blob. Falls back to the original file if
 *   the browser can't decode it as an image or canvas encoding is unavailable.
 */
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!(file instanceof Blob)) {
      reject(new Error('compressImage expects a File or Blob.'));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        const { naturalWidth: width, naturalHeight: height } = img;
        const longEdge = Math.max(width, height);
        const scale = longEdge > MAX_LONG_EDGE ? MAX_LONG_EDGE / longEdge : 1; // never upscale

        const targetWidth = Math.max(1, Math.round(width * scale));
        const targetHeight = Math.max(1, Math.round(height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          resolve(blob ?? file);
        }, OUTPUT_TYPE, OUTPUT_QUALITY);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not load image data.'));
    };

    img.src = objectUrl;
  });
}

/**
 * Compress a Blob and wrap it back into a File so it can be appended to FormData with a
 * sensible name. Always emits a .webp
 * extension since the output is re-encoded as image/webp.
 *
 * @param {Blob} file - source image.
 * @param {string} [fileName] - desired base name (extension is replaced with .webp).
 * @returns {Promise<File>}
 */
export async function compressImageToFile(file, fileName) {
  const blob = await compressImage(file);
  const baseName = (fileName || (file instanceof File ? file.name : 'screenshot'))
    .replace(/\.[^./\\]+$/, '');
  return new File([blob], `${baseName}.webp`, { type: blob.type || OUTPUT_TYPE });
}
