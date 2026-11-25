import { sha256Hex } from "@/lib/records/payload";

export interface CapturedPhoto {
  clientPhotoId: string;
  blob: Blob;
  sha256: string;
  takenAt: string;
  previewUrl: string;
}

/** Compresses a camera image to at most 1600px on the long edge, JPEG ~0.7 (SPEC 7). */
export async function compressPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not compress photo"))), "image/jpeg", 0.7),
  );
}

export async function capturePhoto(file: File): Promise<CapturedPhoto> {
  const blob = await compressPhoto(file);
  return {
    clientPhotoId: crypto.randomUUID(),
    blob,
    sha256: await sha256Hex(await blob.arrayBuffer()),
    takenAt: new Date().toISOString(),
    previewUrl: URL.createObjectURL(blob),
  };
}
