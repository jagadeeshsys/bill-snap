
export interface ProcessedImage {
  file: File;
  originalName: string;
  previewUrl: string;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

export async function processImage(file: File): Promise<ProcessedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please select a valid image.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Image size must be below 10 MB.");
  }

  const imageUrl = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.src = imageUrl;

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Unable to read this image."));
    });

    const scale = Math.min(
      1,
      MAX_DIMENSION / Math.max(image.width, image.height)
    );

    const width = Math.round(image.width * scale);
    const height = Math.round(image.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Image processing is not supported.");
    }

    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) resolve(result);
          else reject(new Error("Image compression failed."));
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    });

    const processedFile = new File(
      [blob],
      "bill-image.jpg",
      { type: "image/jpeg" }
    );

    return {
      file: processedFile,
      originalName: file.name,
      previewUrl: URL.createObjectURL(processedFile),
      originalSize: file.size,
      compressedSize: processedFile.size,
      width,
      height,
    };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}
