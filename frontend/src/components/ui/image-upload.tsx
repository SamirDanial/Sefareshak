import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import Icon from "@mdi/react";
import { mdiUpload, mdiClose } from "@mdi/js";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import { useTranslation } from "react-i18next";

const normalizeOrigin = (value: string) => value.replace(/\/$/, "");

const parseEnvOrigins = (raw: unknown): string[] => {
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(normalizeOrigin);
};

const resolveApiBaseUrl = (): string => {
  const candidates = parseEnvOrigins(import.meta.env.VITE_API_URL as unknown);

  if (typeof window !== "undefined") {
    const current = normalizeOrigin(window.location.origin);
    if (candidates.length === 0) return current;

    const exact = candidates.find((c) => normalizeOrigin(c) === current);
    if (exact) return exact;

    const withoutWww = current.replace(/:\/\/www\./, "://");
    const matchWithoutWww = candidates.find(
      (c) => normalizeOrigin(c).replace(/:\/\/www\./, "://") === withoutWww
    );
    if (matchWithoutWww) return matchWithoutWww;

    return candidates[0];
  }

  return candidates[0] || "http://localhost:3001";
};

const API_BASE_URL = resolveApiBaseUrl();

interface ImageUploadProps {
  value?: string;
  onChange: (value: string) => void;
  onPreviewChange?: (hasPreview: boolean) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}

const ImageUpload: React.FC<ImageUploadProps> = ({
  value,
  onChange,
  onPreviewChange,
  label = "Image",
  className,
  disabled = false,
}) => {
  const { getToken } = useAuth();
  const { t } = useTranslation();
  const [preview, setPreview] = useState<string | null>(value || null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notify parent when preview changes
  useEffect(() => {
    onPreviewChange?.(!!preview);
  }, [preview, onPreviewChange]);

  // Cleanup preview URL on unmount or when preview changes
  useEffect(() => {
    return () => {
      if (preview && preview.startsWith("blob:")) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      alert(t("admin.menuManagement.imageUpload.selectImageFile"));
      return;
    }

    // Validate file size (max 10MB for high-res images)
    if (file.size > 10 * 1024 * 1024) {
      alert(t("admin.menuManagement.imageUpload.fileSizeTooLarge"));
      return;
    }

    // Set selected file and show preview immediately
    setSelectedFile(file);

    // Clean up previous preview URL if it exists
    if (preview && preview.startsWith("blob:")) {
      URL.revokeObjectURL(preview);
    }

    // Create preview URL - DON'T call onChange yet
    const previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);
    // Immediately notify parent that preview is visible
    onPreviewChange?.(true);
    // Don't call onChange - only preview for now
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);

    try {
      const token = await getToken();

      // Create FormData for file upload
      const formData = new FormData();
      formData.append("image", selectedFile);

      // Upload to backend with authentication
      const response = await fetch(`${API_BASE_URL}/api/upload/image`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      const result = await response.json();

      if (result.success && result.data) {
        const imageData = result.data;
        const imageFilename = imageData.filename;

        setPreview(imageFilename);
        onChange(imageFilename);
        setSelectedFile(null);
        // Preview state stays the same (true), but ensure parent is notified
        onPreviewChange?.(true);
      } else {
        throw new Error("Invalid response");
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert(t("admin.menuManagement.imageUpload.uploadFailed"));
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveImage = () => {
    setPreview(null);
    onChange("");
    setSelectedFile(null);
    // Immediately notify parent that preview is removed
    onPreviewChange?.(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor="image-upload">{label}</Label>

      {/* Image Preview */}
      {preview && (
        <div className="relative w-full h-32 rounded-lg overflow-hidden bg-muted border border-border">
          <img
            src={
              preview.startsWith("blob:")
                ? preview
                : isExternalImage(preview)
                ? preview
                : getOptimizedImageUrl(preview, "medium")
            }
            alt="Preview"
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => {
              // Only clear preview if it's not an external URL or blob URL
              if (!isExternalImage(preview) && !preview.startsWith("blob:")) {
                setPreview(null);
              }
            }}
          />
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="absolute top-2 right-2 h-6 w-6 p-0 bg-red-500 hover:bg-red-600"
            onClick={handleRemoveImage}
            disabled={disabled}
          >
            <Icon path={mdiClose} size={0.5} />
          </Button>
        </div>
      )}

      {/* Upload Controls */}
      <div className="space-y-2">
        {selectedFile ? (
          /* Upload Actions when file is selected */
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleUpload}
              disabled={disabled || isUploading}
              className="flex-1 bg-pink-500 hover:bg-pink-600 text-white"
            >
              {isUploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  {t("admin.menuManagement.imageUpload.uploading")}
                </>
              ) : (
                <>
                  <Icon path={mdiUpload} size={0.67} className="mr-2" />
                  {t("admin.menuManagement.imageUpload.uploadImage")}
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                // Clean up blob URL
                if (preview && preview.startsWith("blob:")) {
                  URL.revokeObjectURL(preview);
                }
                setSelectedFile(null);
                const newPreview = value || null;
                setPreview(newPreview);
                // Immediately notify parent about preview state
                onPreviewChange?.(!!newPreview);
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }}
              disabled={disabled || isUploading}
              className="border-border hover:bg-muted"
            >
              {t("admin.menuManagement.imageUpload.cancel")}
            </Button>
          </div>
        ) : (
          /* File Selection when no file is selected */
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="flex-1 border-border bg-card hover:bg-muted"
            >
              <Icon path={mdiUpload} size={0.67} className="mr-2" />
              {t("admin.menuManagement.imageUpload.selectImage")}
            </Button>
          </div>
        )}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled}
        />
      </div>

      {/* Help Text */}
      <p className="text-xs text-muted-foreground">
        {selectedFile
          ? t("admin.menuManagement.imageUpload.selectedFile", {
              fileName: selectedFile.name,
              size: (selectedFile.size / 1024 / 1024).toFixed(2),
            })
          : preview && isExternalImage(preview)
          ? t("admin.menuManagement.imageUpload.externalImageUrl")
          : t("admin.menuManagement.imageUpload.helpText")}
      </p>
    </div>
  );
};

export default ImageUpload;
