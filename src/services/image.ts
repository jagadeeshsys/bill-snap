
export interface ProcessedImage {
  file: File;
  originalName: string;
  previewUrl: string;
  originalSize: number;
  compressedSize: number;
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  wasDownscaled: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

export function getScaledDimensions(
  width: number,
  height: number,
  maxDimension = MAX_DIMENSION
): { width: number; height: number } {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(maxDimension) ||
    width <= 0 ||
    height <= 0 ||
    maxDimension <= 0
  ) {
    throw new Error("Image dimensions are invalid.");
  }

  const scale = Math.min(1, maxDimension / Math.max(width, height));

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

export function enhanceGrayscaleContrast(
  pixels: Uint8ClampedArray,
  contrast = 1.12
): void {
  for (let index = 0; index < pixels.length; index += 4) {
    const grayscale = Math.round(
      pixels[index] * 0.299 +
        pixels[index + 1] * 0.587 +
        pixels[index + 2] * 0.114
    );
    const adjusted = Math.max(
      0,
      Math.min(255, Math.round((grayscale - 128) * contrast + 128))
    );

    pixels[index] = adjusted;
    pixels[index + 1] = adjusted;
    pixels[index + 2] = adjusted;
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  const imageUrl = URL.createObjectURL(file);
  const image = new Image();

  return new Promise((resolve, reject) => {
    image.onload = () => {
      URL.revokeObjectURL(imageUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error("Unable to read this image."));
    };
    image.src = imageUrl;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error("Image compression failed."));
      },
      "image/jpeg",
      quality
    );
  });
}

export async function processImage(file: File): Promise<ProcessedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please select a valid image.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Image size must be below 10 MB.");
  }

  const image = await loadImage(file);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const dimensions = getScaledDimensions(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Image processing is not supported.");
  }

  context.drawImage(image, 0, 0, dimensions.width, dimensions.height);

  const blob = await canvasToJpeg(canvas, JPEG_QUALITY);
  const processedFile = new File([blob], "bill-image.jpg", {
    type: "image/jpeg",
  });

  return {
    file: processedFile,
    originalName: file.name,
    previewUrl: URL.createObjectURL(processedFile),
    originalSize: file.size,
    compressedSize: processedFile.size,
    originalWidth: width,
    originalHeight: height,
    width: dimensions.width,
    height: dimensions.height,
    wasDownscaled: dimensions.width !== width || dimensions.height !== height,
  };
}

export async function createGrayscaleContrastImage(file: File): Promise<File> {
  const image = await loadImage(file);
  const dimensions = getScaledDimensions(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;

  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Image processing is not supported.");
  }

  context.drawImage(image, 0, 0, dimensions.width, dimensions.height);

  const imageData = context.getImageData(0, 0, dimensions.width, dimensions.height);
  enhanceGrayscaleContrast(imageData.data);
  context.putImageData(imageData, 0, 0);

  const blob = await canvasToJpeg(canvas, 0.9);
  return new File([blob], "bill-image-enhanced.jpg", {
    type: "image/jpeg",
  });
}
