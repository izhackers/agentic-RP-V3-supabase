
import { createClient } from '@supabase/supabase-js';

export const getSupabase = (url?: string, key?: string) => {
  const finalUrl = url || localStorage.getItem('supabase_url') || "";
  const finalKey = key || localStorage.getItem('supabase_key') || "";

  if (!finalUrl || !finalKey) return null;
  return createClient(finalUrl, finalKey);
};

export const uploadDocumentToSupabase = async (
  file: File, 
  config: { url: string; key: string; bucket: string }
) => {
  const supabase = getSupabase(config.url, config.key);
  if (!supabase) throw new Error("Supabase client not initialized");

  const fileName = `${Date.now()}_${file.name}`;
  const filePath = `rp_docs/${fileName}`;

  // 1. Upload to Storage
  const { data: storageData, error: storageError } = await supabase.storage
    .from(config.bucket)
    .upload(filePath, file);

  if (storageError) throw storageError;

  // 2. Get Public URL
  const { data: { publicUrl } } = supabase.storage
    .from(config.bucket)
    .getPublicUrl(filePath);

  // 3. Save Metadata to DB (Pastikan anda ada table 'rp_documents')
  const { error: dbError } = await supabase
    .from('rp_documents')
    .insert([
      { 
        name: file.name, 
        mime_type: file.type, 
        storage_path: filePath, 
        public_url: publicUrl 
      }
    ]);

  if (dbError) console.warn("Metadata not saved to DB, but file uploaded:", dbError);

  return { name: file.name, url: publicUrl, type: file.type };
};

export const fetchDocumentsFromSupabase = async (url: string, key: string, bucket: string) => {
  const supabase = getSupabase(url, key);
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('rp_documents')
    .select('*');

  if (error) {
    console.error("Error fetching documents:", error);
    return [];
  }

  return data;
};
