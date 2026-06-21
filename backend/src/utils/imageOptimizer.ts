import sharp from "sharp";
import path from "path";
import fs from "fs/promises";

export interface OptimizedImage {
  filename: string;
}

export class ImageOptimizer {
  // Mobile-optimized square image size
  private static readonly MOBILE_SIZE = 800;

  /**
   * Optimize image for mobile display - creates a single 800x800 square image
   */
  static async optimizeImage(
    inputPath: string,
    outputDir: string,
    filename: string
  ): Promise<OptimizedImage> {
    try {
      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });

      const baseName = path.parse(filename).name;
      const outputPath = path.join(outputDir, `${baseName}.webp`);

      // Get image metadata to determine dimensions
      const metadata = await sharp(inputPath).metadata();

      if (!metadata.width || !metadata.height) {
        throw new Error("Invalid image dimensions");
      }

      // Resize to square maintaining aspect ratio without cropping
      await sharp(inputPath)
        .resize(this.MOBILE_SIZE, this.MOBILE_SIZE, {
          fit: "inside", // Maintain aspect ratio, fit inside bounds
          withoutEnlargement: true, // Don't upscale smaller images
        })
        .webp({
          quality: 90,
          effort: 6, // Maximum compression effort
        })
        .toFile(outputPath);

      return {
        filename: path.basename(outputPath),
      };
    } catch (error) {
      console.error("Error optimizing image:", error);
      throw new Error("Failed to optimize image");
    }
  }

  /**
   * Clean up temporary files
   */
  static async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.error("Error cleaning up temp file:", error);
    }
  }

  /**
   * Validate image file
   */
  static async validateImage(filePath: string): Promise<boolean> {
    try {
      const metadata = await sharp(filePath).metadata();
      return !!(metadata.width && metadata.height);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get image metadata
   */
  static async getImageMetadata(filePath: string) {
    try {
      return await sharp(filePath).metadata();
    } catch (error) {
      throw new Error("Failed to read image metadata");
    }
  }
}
