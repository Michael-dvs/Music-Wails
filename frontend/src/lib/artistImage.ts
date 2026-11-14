import { fetchAPI } from './fetchAPI';
import { getHighResArtwork } from '../pages/AlbumDetail';

// Cache in-memory agar hasil query gambar tersimpan selama aplikasi berjalan
const artistImageCache = new Map<string, string>();

/**
 * Mencari URL foto profil artis berkualitas tinggi.
 * 1. Mengecek memory cache.
 * 2. Memanggil Deezer API untuk mendapatkan foto portrait artis (medium/big).
 * 3. Fallback ke iTunes Album Artwork jika artis memiliki artistId.
 * 4. Mengembalikan null jika foto tidak ditemukan.
 */
export async function fetchArtistImage(artistName: string, artistId?: number): Promise<string | null> {
  if (!artistName || !artistName.trim()) return null;

  const cacheKey = artistName.trim().toLowerCase();
  if (artistImageCache.has(cacheKey)) {
    const cached = artistImageCache.get(cacheKey);
    return cached && cached.length > 0 ? cached : null;
  }

  // 1. Strategi Utama: Deezer Search Artist API
  try {
    const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName.trim())}`;
    const data = await fetchAPI<any>(url);
    if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
      // Cari yang nama persis sama, jika tidak ada pakai hasil teratas
      const exact = data.data.find(
        (item: any) => item.name?.toLowerCase() === artistName.trim().toLowerCase()
      );
      const chosen = exact || data.data[0];
      const pic = chosen?.picture_medium || chosen?.picture_big || chosen?.picture;
      if (pic && typeof pic === 'string' && !pic.includes('/artist//') && !pic.includes('default')) {
        artistImageCache.set(cacheKey, pic);
        return pic;
      }
    }
  } catch (err) {
    console.debug(`[artistImage] Deezer lookup failed for "${artistName}":`, err);
  }

  // 2. Strategi Cadangan: iTunes Top Album Artwork
  if (artistId && artistId > 0) {
    try {
      const itunesUrl = `https://itunes.apple.com/lookup?id=${artistId}&entity=album&limit=1&country=id`;
      const data = await fetchAPI<any>(itunesUrl);
      const album = data?.results?.find((r: any) => r.wrapperType === 'collection');
      if (album?.artworkUrl100) {
        const highRes = getHighResArtwork(album.artworkUrl100);
        artistImageCache.set(cacheKey, highRes);
        return highRes;
      }
    } catch (err) {
      console.debug(`[artistImage] iTunes album lookup failed for "${artistName}":`, err);
    }
  }

  // Simpan string kosong sebagai penanda sudah pernah dicari dan tidak ditemukan
  artistImageCache.set(cacheKey, '');
  return null;
}

