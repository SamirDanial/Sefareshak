import { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { ImageOptimizer, OptimizedImage } from "../utils/imageOptimizer";

// Configure multer for file uploads (temporary storage)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(__dirname, "../../uploads/temp");

    // Create directory if it doesn't exist
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with original extension
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

// File filter to only allow images
const fileFilter = (
  req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"));
  }
};

// Configure multer
export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
});

// Image upload controller
export const uploadImage = async (req: Request, res: Response) => {
  let tempFilePath: string | null = null;

  try {
    if (!req.file) {
      console.error("[UploadController] No file provided");
      return res.status(400).json({
        success: false,
        message: "No image file provided",
      });
    }

    tempFilePath = req.file.path;

    // Validate the image
    const isValidImage = await ImageOptimizer.validateImage(tempFilePath);
    if (!isValidImage) {
      console.error("[UploadController] Invalid image file");
      return res.status(400).json({
        success: false,
        message: "Invalid image file",
      });
    }

    // Get image metadata
    const metadata = await ImageOptimizer.getImageMetadata(tempFilePath);

    // Define output directory for optimized images
    const outputDir = path.join(__dirname, "../../uploads/images");

    // Generate optimized images
    const optimizedImages: OptimizedImage = await ImageOptimizer.optimizeImage(
      tempFilePath,
      outputDir,
      req.file.filename
    );

    // Clean up temporary file
    await ImageOptimizer.cleanupTempFile(tempFilePath);
    tempFilePath = null;

    // Return success response with optimized image
    const responseData = {
      success: true,
      data: {
        filename: optimizedImages.filename,
        url: `/uploads/images/${optimizedImages.filename}`,
        metadata: {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          size: metadata.size,
        },
        originalName: req.file.originalname,
      },
      message: "Image uploaded and optimized successfully",
    };

    return res.json(responseData);
  } catch (error) {
    console.error("[UploadController] Error uploading image:", error);

    // Clean up temporary file if it exists
    if (tempFilePath) {
      await ImageOptimizer.cleanupTempFile(tempFilePath);
    }

    return res.status(500).json({
      success: false,
      message: "Failed to upload and optimize image",
    });
  }
};

// Serve uploaded images
export const serveImage = (req: Request, res: Response) => {
  try {
    const filename = req.params.filename;
    const imagePath = path.join(__dirname, "../../uploads/images", filename);

    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    // Determine content type based on file extension
    const ext = path.extname(filename).toLowerCase();
    let contentType = "image/jpeg"; // default

    if (ext === ".webp") {
      contentType = "image/webp";
    } else if (ext === ".png") {
      contentType = "image/png";
    } else if (ext === ".gif") {
      contentType = "image/gif";
    }

    // Set appropriate headers
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000"); // Cache for 1 year
    res.setHeader("ETag", `"${filename}"`); // Add ETag for better caching

    // Send the image file
    return res.sendFile(imagePath);
  } catch (error) {
    console.error("Error serving image:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to serve image",
    });
  }
};
