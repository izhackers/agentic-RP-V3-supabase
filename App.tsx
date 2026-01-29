
import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import ChatBubble from './components/ChatBubble';
import DocumentUploader from './components/DocumentUploader';
import { Message, Role, RPDocument } from './types';
import { sendMessageToGemini } from './services/gemini';
import { fetchDocumentsFromSupabase, uploadDocumentToSupabase } from './services/supabase';
import { EXAMPLE_QUESTIONS, INITIAL_WELCOME_MESSAGE, CONNECTION_ERROR_MESSAGE, APP_NAME, DISCLAIMER_TEXT } from './constants';

const App: React.FC = () => {
  const [isEmbedMode, setIsEmbedMode] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ id: 'welcome', role: Role.MODEL, content: INITIAL_WELCOME_MESSAGE, timestamp: new Date() }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState<RPDocument[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [toast, setToast] = useState<{show: boolean, message: string}>({show: false, message: ''});
  
  // Supabase State
  const [sbUrl, setSbUrl] = useState(localStorage.getItem('supabase_url') || '');
  const [sbKey, setSbKey] = useState(localStorage.getItem('supabase_key') || '');
  const [sbBucket, setSbBucket] = useState(localStorage.getItem('supabase_bucket') || 'rp_files');

  const imageInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isPreviewEnv = typeof window !== 'undefined' && (window.location.hostname.includes('googleusercontent') || window.location.hostname.includes('webcontainer'));

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') === 'embed') setIsEmbedMode(true);
    
    const storedKey = localStorage.getItem("gemini_api_key");
    if (storedKey) setApiKey(storedKey);

    // Auto-fetch from Supabase if config exists
    if (sbUrl && sbKey) {
      loadOfficialDocuments();
    }
  }, []);

  const loadOfficialDocuments = async () => {
    try {
      const docs = await fetchDocumentsFromSupabase(sbUrl, sbKey, sbBucket);
      if (docs && docs.length > 0) {
        const formattedDocs: RPDocument[] = await Promise.all(docs.map(async (d: any) => {
          // Fetch content for Gemini (needs base64 for PDF or text for TXT)
          const response = await fetch(d.public_url);
          const blob = await response.blob();
          return new Promise<RPDocument>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              resolve({
                id: d.id.toString(),
                name: d.name,
                content: reader.result as string,
                mimeType: d.mime_type,
                source: 'supabase'
              });
            };
            if (d.mime_type === 'application/pdf') reader.readAsDataURL(blob);
            else reader.readAsText(blob);
          });
        }));
        setDocuments(prev => [...prev, ...formattedDocs]);
        showToast(`${formattedDocs.length} dokumen rasmi dimuat dari Supabase.`);
      }
    } catch (e) {
      console.error("Fail load Supabase docs", e);
    }
  };

  const showToast = (message: string) => {
    setToast({show: true, message});
    setTimeout(() => setToast({show: false, message: ''}), 3000);
  };

  const handleAddDocuments = (files: File[]) => {
    files.forEach(file => {
      const isPdf = file.type === 'application/pdf';
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setDocuments(prev => [...prev, {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          name: file.name,
          content: content,
          mimeType: isPdf ? 'application/pdf' : 'text/plain',
          source: 'local'
        }]);
      };
      if (isPdf) reader.readAsDataURL(file);
      else reader.readAsText(file);
    });
  };

  const handleUploadToCloud = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !sbUrl || !sbKey) {
      alert("Sila lengkapkan konfigurasi Supabase dahulu.");
      return;
    }
    setIsLoading(true);
    try {
      const file = e.target.files[0];
      await uploadDocumentToSupabase(file, { url: sbUrl, key: sbKey, bucket: sbBucket });
      showToast("Berjaya simpan ke Cloud!");
      loadOfficialDocuments();
    } catch (err: any) {
      alert("Gagal upload: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !selectedImage) || isLoading) return;
    const userMessage: Message = { id: Date.now().toString(), role: Role.USER, content: input, timestamp: new Date(), attachment: selectedImage || undefined };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    const currentImg = selectedImage;
    setSelectedImage(null);
    setIsLoading(true);
    try {
      const reply = await sendMessageToGemini(messages, input, documents, currentImg || undefined, apiKey);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: Role.MODEL, content: reply, timestamp: new Date() }]);
    } catch (error) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: Role.SYSTEM, content: CONNECTION_ERROR_MESSAGE, timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`flex flex-col h-screen font-sans text-slate-800 relative ${isEmbedMode ? 'bg-white' : 'bg-slate-100'}`}>
      {!isEmbedMode && <Header onShare={() => {}} onOpenSettings={() => setShowSettings(true)} />}
      
      <main className="flex-1 flex overflow-hidden max-w-7xl mx-auto w-full p-4 gap-4">
        {!isEmbedMode && (
          <aside className="hidden md:flex flex-col w-1/4 h-full gap-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex-1 overflow-y-auto">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Contoh Pertanyaan</h3>
              <ul className="space-y-2">
                {EXAMPLE_QUESTIONS.map((q, i) => (
                  <li key={i} className="text-xs p-2 bg-slate-50 hover:bg-blue-50 text-slate-600 rounded cursor-pointer border border-slate-100" onClick={() => setInput(q)}>{q}</li>
                ))}
              </ul>
              <div className="mt-6 pt-4 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-500 mb-2 uppercase">PENAFIAN</h4>
                <p className="text-[10px] text-slate-400 text-justify">{DISCLAIMER_TEXT}</p>
              </div>
            </div>
          </aside>
        )}

        <section className={`flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative ${isEmbedMode ? 'w-full' : ''}`}>
          {isEmbedMode && (
            <div className="absolute top-2 right-2 z-20 flex space-x-2">
              <button onClick={() => setShowSettings(true)} className="p-2 text-slate-400 bg-slate-50 border border-slate-200 rounded-full shadow-sm"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg></button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50">
            {messages.map((msg) => msg.role !== Role.SYSTEM && <ChatBubble key={msg.id} message={msg} />)}
            {isLoading && <div className="p-4 bg-white border rounded-2xl w-fit animate-pulse">...</div>}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-white border-t">
            <div className="flex items-end space-x-2">
              <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Tanya sesuatu..." className="flex-1 bg-slate-100 rounded-xl px-4 py-3 text-sm resize-none" rows={1} onKeyDown={(e) => e.key === 'Enter' && handleSend()} />
              <button onClick={handleSend} className="p-3 bg-blue-600 text-white rounded-xl shadow-md"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" /></svg></button>
            </div>
          </div>
        </section>
      </main>

      {showSettings && (
        <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-semibold text-slate-800">Tetapan & Database</h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400">X</button>
            </div>
            
            <div className="p-4 overflow-y-auto space-y-4">
              {/* Gemini API */}
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                <label className="text-[10px] font-bold text-blue-800 uppercase block mb-1">Gemini API Key</label>
                <input type="password" value={apiKey} onChange={(e) => {setApiKey(e.target.value); localStorage.setItem('gemini_api_key', e.target.value);}} className="w-full text-xs p-2 rounded border border-blue-200" placeholder="AI Studio Key..." />
              </div>

              {/* Supabase Config */}
              <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                <label className="text-[10px] font-bold text-green-800 uppercase block mb-1">Supabase Config (Cloud Storage)</label>
                <input type="text" placeholder="URL Supabase" value={sbUrl} onChange={(e) => {setSbUrl(e.target.value); localStorage.setItem('supabase_url', e.target.value);}} className="w-full text-xs p-2 mb-2 rounded border" />
                <input type="password" placeholder="Anon Key" value={sbKey} onChange={(e) => {setSbKey(e.target.value); localStorage.setItem('supabase_key', e.target.value);}} className="w-full text-xs p-2 mb-2 rounded border" />
                <input type="text" placeholder="Bucket Name" value={sbBucket} onChange={(e) => {setSbBucket(e.target.value); localStorage.setItem('supabase_bucket', e.target.value);}} className="w-full text-xs p-2 rounded border" />
              </div>

              {/* Document Actions */}
              <div>
                <h4 className="text-xs font-bold mb-2">Muat Naik ke Cloud (Supabase)</h4>
                <input type="file" onChange={handleUploadToCloud} className="text-xs w-full p-2 border border-dashed rounded-lg" />
              </div>

              <div className="pt-2">
                <h4 className="text-xs font-bold mb-2">Dokumen Aktif (Local + Cloud)</h4>
                <DocumentUploader onAddDocuments={handleAddDocuments} onRemoveDocument={(id) => setDocuments(d => d.filter(x => x.id !== id))} documents={documents} />
              </div>

              {/* Embed Link */}
              <div className="p-2 bg-slate-100 rounded text-[10px]">
                <strong>Embed Link:</strong> {window.location.origin}/?mode=embed
              </div>
            </div>
            
            <div className="p-4 bg-slate-50 border-t flex justify-end">
              <button onClick={() => setShowSettings(false)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Simpan</button>
            </div>
          </div>
        </div>
      )}

      {toast.show && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-full z-[100] text-xs shadow-xl">{toast.message}</div>}
    </div>
  );
};

export default App;
