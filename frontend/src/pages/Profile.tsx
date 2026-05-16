import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { User, Mail, Lock, Upload, Loader2, Save, LogOut } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Profile() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  
  // Tab State
  const [activeTab, setActiveTab] = useState<'general' | 'security'>('general');

  // General State
  const [username, setUsername] = useState(profile?.username || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);
  const [generalMsg, setGeneralMsg] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Security State
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [isSavingSecurity, setIsSavingSecurity] = useState(false);
  const [securityMsg, setSecurityMsg] = useState<{type: 'success' | 'error', text: string} | null>(null);

  useEffect(() => {
    if (profile) {
      setUsername(profile.username || '');
      setAvatarUrl(profile.avatar_url || '');
    }
  }, [profile]);

  useEffect(() => {
    if (user) setEmail(user.email || '');
  }, [user]);

  // --- Avatar Upload & Compression ---
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    if (!user) return;

    setIsUploading(true);
    setGeneralMsg(null);

    try {
      // Compress Image using Canvas
      const compressedBlob = await compressImage(file, 400); // max 400px
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Math.random()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      // Upload to Supabase Storage 'profiles' bucket
      const { error: uploadError } = await supabase.storage
        .from('profiles')
        .upload(filePath, compressedBlob, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data } = supabase.storage.from('profiles').getPublicUrl(filePath);
      setAvatarUrl(data.publicUrl);
      setGeneralMsg({ type: 'success', text: 'Avatar berhasil diunggah! Jangan lupa klik Simpan.' });
    } catch (err: any) {
      setGeneralMsg({ type: 'error', text: `Upload gagal: ${err.message}` });
    } finally {
      setIsUploading(false);
    }
  };

  const compressImage = (file: File, maxSize: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height && width > maxSize) {
            height *= maxSize / width;
            width = maxSize;
          } else if (height > maxSize) {
            width *= maxSize / height;
            height = maxSize;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas to Blob failed'));
          }, 'image/jpeg', 0.8);
        };
      };
      reader.onerror = error => reject(error);
    });
  };

  // --- Save General Profile ---
  const saveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setIsSavingGeneral(true);
    setGeneralMsg(null);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ username, avatar_url: avatarUrl })
        .eq('id', profile.id);

      if (error) throw error;
      await refreshProfile();
      window.dispatchEvent(new CustomEvent('profileUpdated'));
      setGeneralMsg({ type: 'success', text: 'Profil berhasil diperbarui!' });
      setTimeout(() => setGeneralMsg(null), 3000);
    } catch (err: any) {
      setGeneralMsg({ type: 'error', text: err.message });
    } finally {
      setIsSavingGeneral(false);
    }
  };

  // --- Save Security Settings ---
  const saveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSecurity(true);
    setSecurityMsg(null);

    try {
      const updates: { email?: string; password?: string } = {};
      if (email !== user?.email) updates.email = email;
      if (password.trim() !== '') updates.password = password;

      if (Object.keys(updates).length === 0) {
        setSecurityMsg({ type: 'success', text: 'Tidak ada perubahan.' });
        setIsSavingSecurity(false);
        return;
      }

      const { error } = await supabase.auth.updateUser(updates);
      if (error) throw error;

      setSecurityMsg({ type: 'success', text: 'Kredensial berhasil diperbarui. Jika mengubah email, periksa kotak masuk Anda untuk verifikasi.' });
      setPassword('');
    } catch (err: any) {
      if (err.message.includes('Session expired') || err.message.includes('refresh token')) {
         setSecurityMsg({ type: 'error', text: 'Sesi Anda telah kedaluwarsa. Harap logout dan login kembali untuk mengubah keamanan akun.' });
      } else {
         setSecurityMsg({ type: 'error', text: err.message });
      }
    } finally {
      setIsSavingSecurity(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col text-gray-900 dark:text-white bg-white dark:bg-[#121212] overflow-hidden">
      
      {/* Header Profile Summary */}
      <div className="w-full bg-gray-50 dark:bg-[#1a1a1a] border-b border-gray-200 dark:border-white/10 p-8 flex-shrink-0">
        <div className="max-w-3xl mx-auto flex items-center space-x-6">
          <div className="relative group">
            <div className="w-24 h-24 rounded-full bg-brand-500/20 overflow-hidden flex items-center justify-center border-4 border-white dark:border-[#1c1c1e] shadow-lg">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User className="w-10 h-10 text-brand-500" />
              )}
            </div>
            {/* Upload Overlay */}
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-full flex items-center justify-center"
            >
              {isUploading ? <Loader2 className="w-6 h-6 text-white animate-spin" /> : <Upload className="w-6 h-6 text-white" />}
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*"
              onChange={handleFileChange}
            />
          </div>

          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight">{profile?.username || 'User'}</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">{user?.email}</p>
          </div>

          <button 
            onClick={signOut}
            className="px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-full font-medium flex items-center space-x-2 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-3xl mx-auto space-y-8 pb-24">
          
          {/* Tabs Navigation */}
          <div className="flex space-x-6 border-b border-black/10 dark:border-white/10 mb-8">
            <button
              onClick={() => setActiveTab('general')}
              className={`pb-3 text-sm font-medium transition-all ${
                activeTab === 'general' ? 'border-b-2 border-brand-500 text-brand-500' : 'text-gray-500 hover:text-black dark:hover:text-white'
              }`}
            >
              Profil Umum
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`pb-3 text-sm font-medium transition-all ${
                activeTab === 'security' ? 'border-b-2 border-brand-500 text-brand-500' : 'text-gray-500 hover:text-black dark:hover:text-white'
              }`}
            >
              Keamanan Akun
            </button>
          </div>

          {/* Form General */}
          {activeTab === 'general' && (
            <motion.form 
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
              onSubmit={saveGeneral} 
              className="bg-gray-100 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl p-6 shadow-sm space-y-6"
            >
              <h2 className="text-lg font-semibold flex items-center space-x-2">
                <User className="w-5 h-5 text-gray-400" />
                <span>Informasi Publik</span>
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-white dark:bg-[#1c1c1e] border border-gray-300 dark:border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              {generalMsg && (
                <div className={`p-4 rounded-xl text-sm font-medium ${
                  generalMsg.type === 'success' ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                }`}>
                  {generalMsg.text}
                </div>
              )}

              <div className="flex justify-end">
                <button type="submit" disabled={isSavingGeneral} className="flex items-center space-x-2 bg-brand-500 hover:bg-brand-600 text-white px-6 py-2.5 rounded-full font-medium transition-all disabled:opacity-50">
                  {isSavingGeneral ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>Simpan Perubahan</span>
                </button>
              </div>
            </motion.form>
          )}

          {/* Form Security */}
          {activeTab === 'security' && (
            <motion.form 
              initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
              onSubmit={saveSecurity} 
              className="bg-gray-100 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl p-6 shadow-sm space-y-6"
            >
              <h2 className="text-lg font-semibold flex items-center space-x-2">
                <Lock className="w-5 h-5 text-gray-400" />
                <span>Ubah Kredensial</span>
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email Baru</label>
                  <div className="relative">
                    <Mail className="w-5 h-5 absolute left-3 top-3.5 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-white dark:bg-[#1c1c1e] border border-gray-300 dark:border-white/10 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Password Baru (Kosongkan jika tidak ingin mengubah)</label>
                  <div className="relative">
                    <Lock className="w-5 h-5 absolute left-3 top-3.5 text-gray-400" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-white dark:bg-[#1c1c1e] border border-gray-300 dark:border-white/10 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>

              {securityMsg && (
                <div className={`p-4 rounded-xl text-sm font-medium ${
                  securityMsg.type === 'success' ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                }`}>
                  {securityMsg.text}
                </div>
              )}

              <div className="flex justify-end">
                <button type="submit" disabled={isSavingSecurity} className="flex items-center space-x-2 bg-brand-500 hover:bg-brand-600 text-white px-6 py-2.5 rounded-full font-medium transition-all disabled:opacity-50">
                  {isSavingSecurity ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>Update Kredensial</span>
                </button>
              </div>
            </motion.form>
          )}

        </div>
      </div>
    </div>
  );
}
