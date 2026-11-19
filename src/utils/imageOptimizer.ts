/**
 * Client-side avatar image optimizer and validator.
 * - Rejects ephemeral blob: URLs so they are never persisted to DB or localStorage.
 * - Resizes & compresses uploaded camera/gallery images via HTML5 Canvas (max 320x320 JPEG)
 *   so uploads are fast, lightweight (~15–35KB), and never overflow storage quotas.
 */

export function isEphemeralBlobUrl(value?: string | null): boolean {
  return typeof value === 'string' && value.trim().toLowerCase().startsWith('blob:');
}

export function sanitizeAvatarUrl(value?: string | null): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || isEphemeralBlobUrl(trimmed)) return '';
  return trimmed;
}

export async function optimizeAvatarImageFile(
  file: File,
  options: { maxDimension?: number; quality?: number } = {}
): Promise<string> {
  const maxDimension = options.maxDimension ?? 320;
  const quality = options.quality ?? 0.82;

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Görsel dosyası okunamadı.'));
    reader.onload = () => {
      const rawDataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawDataUrl || !rawDataUrl.startsWith('data:image/')) {
        reject(new Error('Geçerli bir görsel dosyası seçiniz (JPG, PNG, WEBP).'));
        return;
      }

      const img = new Image();
      img.onerror = () => {
        // Fallback to raw data URL only if reasonably small
        if (rawDataUrl.length <= 250_000) {
          resolve(rawDataUrl);
        } else {
          reject(new Error('Görsel işlenemedi. Lütfen farklı bir JPG veya PNG dosyası seçiniz.'));
        }
      };
      img.onload = () => {
        try {
          const srcW = img.naturalWidth || img.width || maxDimension;
          const srcH = img.naturalHeight || img.height || maxDimension;
          const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));
          const targetW = Math.max(1, Math.round(srcW * scale));
          const targetH = Math.max(1, Math.round(srcH * scale));

          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(rawDataUrl);
            return;
          }
          // Fill white background in case PNG has transparency
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.drawImage(img, 0, 0, targetW, targetH);

          const compressed = canvas.toDataURL('image/jpeg', quality);
          resolve(compressed && compressed.startsWith('data:image/') ? compressed : rawDataUrl);
        } catch {
          resolve(rawDataUrl);
        }
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}
