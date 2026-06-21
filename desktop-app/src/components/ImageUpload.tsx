import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Upload, X, Loader2, Utensils } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface ImageUploadProps {
  value?: string;
  onChange: (value: string) => void;
  onPreviewChange?: (hasPreview: boolean) => void;
  disabled?: boolean;
  showPlaceholder?: boolean; // Show placeholder when no image in edit mode
  translationNamespace?: string; // Translation namespace, e.g., "admin.categoryManagement.categoryForm" or "admin.menuManagement"
}

const isExternalImage = (url: string): boolean => {
  return url.startsWith("http://") || url.startsWith("https://");
};

const ImageUpload: React.FC<ImageUploadProps> = ({
  value,
  onChange,
  onPreviewChange,
  disabled = false,
  showPlaceholder = false,
  translationNamespace = "admin.categoryManagement.categoryForm",
}) => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const [preview, setPreview] = useState<string | null>(value || null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevValueRef = useRef<string | undefined>(value);
  const isSelectingFileRef = useRef(false);

  // Update preview when value changes externally (important for edit mode)
  // BUT don't interfere when user is selecting a file (blob preview)
  useEffect(() => {
    // Only update if:
    // 1. Value is defined
    // 2. Value actually changed
    // 3. No file is currently selected (user isn't in the middle of selecting a file)
    // 4. Preview is not a blob URL (blob URLs are temporary file previews)
    if (
      value !== undefined && 
      value !== prevValueRef.current && 
      !selectedFile &&
      !(preview && preview.startsWith("blob:"))
    ) {
      // Clean up any blob URL before setting new preview
      if (preview && preview.startsWith("blob:")) {
        URL.revokeObjectURL(preview);
      }
      setPreview(value || null);
      setImageError(false); // Reset error when value changes
      prevValueRef.current = value;
    }
  }, [value, preview, selectedFile]);

  // Notify parent when preview changes
  useEffect(() => {
    onPreviewChange?.(!!preview && !imageError);
  }, [preview, imageError, onPreviewChange]);

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
      alert(t(`${translationNamespace}.imageUpload.selectImageFile`));
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert(t(`${translationNamespace}.imageUpload.fileSizeTooLarge`));
      return;
    }

    // Mark that we're selecting a file to prevent useEffect from interfering
    isSelectingFileRef.current = true;

    // Clean up previous preview URL if it exists (but not if it's the current value)
    if (preview && preview.startsWith("blob:")) {
      URL.revokeObjectURL(preview);
    }

    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    
    // Set selected file and preview immediately
    setSelectedFile(file);
    setPreview(previewUrl);
    setImageError(false); // Reset any previous errors
    onPreviewChange?.(true);
    
    // Reset the flag after state updates
    setTimeout(() => {
      isSelectingFileRef.current = false;
    }, 0);
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

        // Clean up blob URL
        if (preview && preview.startsWith("blob:")) {
          URL.revokeObjectURL(preview);
        }

        setPreview(imageFilename);
        onChange(imageFilename);
        setSelectedFile(null);
        onPreviewChange?.(true);
      } else {
        throw new Error("Invalid response");
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert(t(`${translationNamespace}.imageUpload.uploadFailed`));
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveImage = () => {
    // Clean up blob URL if exists
    if (preview && preview.startsWith("blob:")) {
      URL.revokeObjectURL(preview);
    }
    setPreview(null);
    onChange("");
    setSelectedFile(null);
    setImageError(false);
    onPreviewChange?.(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const getImageUrl = (imagePath: string): string => {
    if (isExternalImage(imagePath)) {
      return imagePath;
    }
    if (imagePath.startsWith("blob:")) {
      return imagePath;
    }
    return `${API_BASE_URL}/uploads/images/${imagePath}`;
  };

  // Show placeholder when: no preview, image error, or showPlaceholder is true and no preview/selectedFile
  const shouldShowPlaceholder = !preview || imageError || (showPlaceholder && !preview && !selectedFile);
  // Show image when: there's a preview and no error (works for both blob previews and uploaded images)
  const hasValidImage = preview && !imageError;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Image Preview or Placeholder */}
      {(preview || shouldShowPlaceholder) && (
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "200px",
            borderRadius: "8px",
            overflow: "hidden",
            backgroundColor: "#f9fafb",
            border: "1px solid #e5e7eb",
          }}
        >
          {hasValidImage ? (
            <>
              <img
                src={getImageUrl(preview)}
                alt="Preview"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  objectPosition: "center",
                }}
                onError={() => {
                  // Mark image as failed to load
                  setImageError(true);
                  onPreviewChange?.(false);
                }}
                onLoad={() => {
                  // Reset error when image loads successfully
                  setImageError(false);
                  onPreviewChange?.(true);
                }}
              />
              <button
                type="button"
                onClick={handleRemoveImage}
                disabled={disabled}
                style={{
                  position: "absolute",
                  top: "8px",
                  right: "8px",
                  padding: "6px",
                  border: "none",
                  borderRadius: "4px",
                  backgroundColor: "#dc2626",
                  color: "#ffffff",
                  cursor: disabled ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: disabled ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!disabled) {
                    e.currentTarget.style.backgroundColor = "#b91c1c";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!disabled) {
                    e.currentTarget.style.backgroundColor = "#dc2626";
                  }
                }}
              >
                <X style={{ height: "14px", width: "14px" }} />
              </button>
            </>
          ) : (
            /* Placeholder when no image or image failed to load */
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(135deg, #fce7f3 0%, #f3e8ff 100%)",
                border: "2px dashed #e9d5ff",
                gap: "12px",
              }}
            >
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #ec4899 0%, #a855f7 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 12px rgba(236, 72, 153, 0.3)",
                }}
              >
                <Utensils style={{ height: "32px", width: "32px", color: "#ffffff" }} />
              </div>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#9f1239",
                  textAlign: "center",
                }}
              >
                {imageError ? t(`${translationNamespace}.imageUpload.imageFailedToLoad`) : t(`${translationNamespace}.imageUpload.noImageAvailable`)}
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "#6b7280",
                  textAlign: "center",
                }}
              >
                {imageError ? t(`${translationNamespace}.imageUpload.uploadNewImageOrUrl`) : t(`${translationNamespace}.imageUpload.uploadImageOrUrl`)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload Controls */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {selectedFile ? (
          /* Upload Actions when file is selected */
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={handleUpload}
              disabled={disabled || isUploading}
              style={{
                flex: 1,
                padding: "8px 16px",
                fontSize: "14px",
                border: "none",
                borderRadius: "6px",
                backgroundColor: "#ec4899",
                color: "#ffffff",
                cursor: disabled || isUploading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                opacity: disabled || isUploading ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!disabled && !isUploading) {
                  e.currentTarget.style.backgroundColor = "#db2777";
                }
              }}
              onMouseLeave={(e) => {
                if (!disabled && !isUploading) {
                  e.currentTarget.style.backgroundColor = "#ec4899";
                }
              }}
            >
              {isUploading ? (
                <>
                  <Loader2 style={{ height: "16px", width: "16px", animation: "spin 1s linear infinite" }} />
                  {t(`${translationNamespace}.imageUpload.uploading`)}
                </>
              ) : (
                <>
                  <Upload style={{ height: "16px", width: "16px" }} />
                  {t(`${translationNamespace}.imageUpload.uploadImage`)}
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                // Clean up blob URL
                if (preview && preview.startsWith("blob:")) {
                  URL.revokeObjectURL(preview);
                }
                setSelectedFile(null);
                const newPreview = value || null;
                setPreview(newPreview);
                onPreviewChange?.(!!newPreview);
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }}
              disabled={disabled || isUploading}
              style={{
                padding: "8px 16px",
                fontSize: "14px",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                backgroundColor: "#ffffff",
                cursor: disabled || isUploading ? "not-allowed" : "pointer",
                color: "#111827",
                opacity: disabled || isUploading ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!disabled && !isUploading) {
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }
              }}
              onMouseLeave={(e) => {
                if (!disabled && !isUploading) {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                }
              }}
            >
              {t(`${translationNamespace}.imageUpload.cancel`)}
            </button>
          </div>
        ) : (
          /* File Selection when no file is selected */
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            style={{
              width: "100%",
              padding: "8px 16px",
              fontSize: "14px",
              border: "1px solid #e5e7eb",
              borderRadius: "6px",
              backgroundColor: "#ffffff",
              cursor: disabled ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              color: "#111827",
              opacity: disabled ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!disabled) {
                e.currentTarget.style.backgroundColor = "#f9fafb";
              }
            }}
            onMouseLeave={(e) => {
              if (!disabled) {
                e.currentTarget.style.backgroundColor = "#ffffff";
              }
            }}
          >
            <Upload style={{ height: "16px", width: "16px" }} />
            {t(`${translationNamespace}.imageUpload.selectImage`)}
          </button>
        )}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          style={{ display: "none" }}
          disabled={disabled}
        />
      </div>

      {/* Help Text */}
      <p style={{ fontSize: "12px", color: "#6b7280", margin: 0 }}>
        {selectedFile
          ? t(`${translationNamespace}.imageUpload.selectedFile`, { 
              fileName: selectedFile.name, 
              size: (selectedFile.size / 1024 / 1024).toFixed(2) 
            })
          : t(`${translationNamespace}.imageUpload.uploadImageFile`)}
      </p>

      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

export default ImageUpload;

