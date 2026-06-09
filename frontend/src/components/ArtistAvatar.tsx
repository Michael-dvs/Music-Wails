import { useEffect, useState } from 'react';
import { GetArtistImageSmart } from '../../wailsjs/go/main/App';
import { Loader2 } from 'lucide-react';

// Deterministic color from a string (for artist avatars fallback)
export function getAvatarColor(name: string): string {
  const palettes = [
    'from-rose-500 to-pink-700',
    'from-orange-500 to-red-600',
    'from-amber-500 to-orange-600',
    'from-emerald-500 to-teal-700',
    'from-cyan-500 to-blue-700',
    'from-violet-500 to-purple-700',
    'from-fuchsia-500 to-pink-700',
    'from-indigo-500 to-violet-700',
    'from-sky-500 to-indigo-700',
    'from-red-500 to-rose-700',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palettes[Math.abs(hash) % palettes.length];
}

interface ArtistAvatarProps {
  name: string;
  itunesId: number;
  defaultLetter?: string;
  className?: string;
  textClassName?: string;
}

export default function ArtistAvatar({ name, itunesId, defaultLetter, className = '', textClassName = 'text-xl' }: ArtistAvatarProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    GetArtistImageSmart(name, itunesId)
      .then((url: string) => {
        if (active) {
          if (url && url !== '') {
            setImageUrl(url);
          } else {
            setImageUrl(null);
          }
          setLoading(false);
        }
      })
      .catch((err: any) => {
        console.error('[ArtistAvatar] failed to load image for', name, err);
        if (active) {
          setImageUrl(null);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [name, itunesId]);

  const initials = defaultLetter || name.trim().slice(0, 1).toUpperCase();
  const avatarGradient = getAvatarColor(name);

  return (
    <div
      className={`rounded-full overflow-hidden flex items-center justify-center select-none ${className}`}
    >
      {loading ? (
        <div className="w-full h-full bg-zinc-800 flex items-center justify-center animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
        </div>
      ) : imageUrl ? (
        <img
          src={imageUrl}
          alt={name}
          className="w-full h-full object-cover rounded-full transition-opacity duration-300"
          loading="lazy"
        />
      ) : (
        <div className={`w-full h-full bg-gradient-to-br ${avatarGradient} flex items-center justify-center`}>
          <span className={`font-black text-white/90 leading-none tracking-tight ${textClassName}`}>
            {initials}
          </span>
        </div>
      )}
    </div>
  );
}
