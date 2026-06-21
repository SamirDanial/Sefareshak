import { Router } from "express";
import {
  uploadImage,
  serveImage,
  upload,
} from "../controllers/uploadController";
import AuthMiddleware from "../middleware/auth";

const router = Router();
const authMiddleware = AuthMiddleware.getInstance();

// Upload image endpoint
router.post(
  "/image",
  authMiddleware.requireAuth,
  upload.single("image"),
  uploadImage
);

// Serve uploaded images
router.get("/images/:filename", serveImage);

export default router;

