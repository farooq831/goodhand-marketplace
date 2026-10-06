import { useState } from "react";
import { uploadImage } from "../api/uploadApi";

function ImageUploadField({ kind, multiple = false, accept = "image/*", onUploaded }) {
  const [error, setError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleChange(event) {
    const files = [...event.target.files];
    if (!files.length) return;
    setError(null);
    setIsUploading(true);
    try {
      const urls = await Promise.all(files.map((file) => uploadImage(file, kind)));
      onUploaded(multiple ? urls : urls[0]);
      event.target.value = "";
    } catch (err) {
      setError(err.response?.data?.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="upload-field">
      <input type="file" accept={accept} multiple={multiple} onChange={handleChange} disabled={isUploading} className="disabled:opacity-50" />
      {isUploading && <p className="mt-1.5 text-xs text-muted">Uploading...</p>}
      {error && <p className="mt-1.5 text-xs text-red-700">{error}</p>}
    </div>
  );
}

export default ImageUploadField;
