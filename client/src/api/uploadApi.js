import apiClient from "./client";

export async function uploadImage(file, kind) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const { data } = await apiClient.post("/uploads", { dataUrl, kind });
  return data.url;
}
