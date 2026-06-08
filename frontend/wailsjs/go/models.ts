export namespace main {
	
	export class AuthUserInfo {
	    id: string;
	    email: string;
	    role: string;
	
	    static createFrom(source: any = {}) {
	        return new AuthUserInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.email = source["email"];
	        this.role = source["role"];
	    }
	}
	export class FavoriteTrack {
	    id: string;
	    user_id: string;
	    itunes_track_id: string;
	    title: string;
	    artist: string;
	    album: string;
	    artwork_url: string;
	    preview_url: string;
	    added_at: string;
	
	    static createFrom(source: any = {}) {
	        return new FavoriteTrack(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.user_id = source["user_id"];
	        this.itunes_track_id = source["itunes_track_id"];
	        this.title = source["title"];
	        this.artist = source["artist"];
	        this.album = source["album"];
	        this.artwork_url = source["artwork_url"];
	        this.preview_url = source["preview_url"];
	        this.added_at = source["added_at"];
	    }
	}
	export class HomeSettingRow {
	    id: string;
	    section_title: string;
	    itunes_id: string;
	    category: string;
	    display_order: number;
	    is_active: boolean;
	
	    static createFrom(source: any = {}) {
	        return new HomeSettingRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.section_title = source["section_title"];
	        this.itunes_id = source["itunes_id"];
	        this.category = source["category"];
	        this.display_order = source["display_order"];
	        this.is_active = source["is_active"];
	    }
	}
	export class LyricsResult {
	    syncedLyrics: string;
	    plainLyrics: string;
	    lrcDuration: number;
	
	    static createFrom(source: any = {}) {
	        return new LyricsResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.syncedLyrics = source["syncedLyrics"];
	        this.plainLyrics = source["plainLyrics"];
	        this.lrcDuration = source["lrcDuration"];
	    }
	}
	export class PlaylistRow {
	    id: string;
	    user_id: string;
	    name: string;
	    cover_url: string;
	    created_at: string;
	
	    static createFrom(source: any = {}) {
	        return new PlaylistRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.user_id = source["user_id"];
	        this.name = source["name"];
	        this.cover_url = source["cover_url"];
	        this.created_at = source["created_at"];
	    }
	}
	export class PlaylistTrackRow {
	    id: string;
	    playlist_id: string;
	    track_id: string;
	    title: string;
	    artist: string;
	    album: string;
	    cover_url: string;
	    added_at: string;
	    duration: number;
	    order_index: number;
	
	    static createFrom(source: any = {}) {
	        return new PlaylistTrackRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.playlist_id = source["playlist_id"];
	        this.track_id = source["track_id"];
	        this.title = source["title"];
	        this.artist = source["artist"];
	        this.album = source["album"];
	        this.cover_url = source["cover_url"];
	        this.added_at = source["added_at"];
	        this.duration = source["duration"];
	        this.order_index = source["order_index"];
	    }
	}
	export class RecentlyPlayedEntry {
	    track_id: string;
	    title: string;
	    artist: string;
	    album: string;
	    cover_url: string;
	    played_at: string;
	
	    static createFrom(source: any = {}) {
	        return new RecentlyPlayedEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.track_id = source["track_id"];
	        this.title = source["title"];
	        this.artist = source["artist"];
	        this.album = source["album"];
	        this.cover_url = source["cover_url"];
	        this.played_at = source["played_at"];
	    }
	}
	export class SmartTrack {
	    id: string;
	    title: string;
	    artist: string;
	    album: string;
	    genre: string;
	    coverArt: string;
	    previewUrl: string;
	    streamUrl: string;
	    duration: number;
	    source: string;
	    isReady: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SmartTrack(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.artist = source["artist"];
	        this.album = source["album"];
	        this.genre = source["genre"];
	        this.coverArt = source["coverArt"];
	        this.previewUrl = source["previewUrl"];
	        this.streamUrl = source["streamUrl"];
	        this.duration = source["duration"];
	        this.source = source["source"];
	        this.isReady = source["isReady"];
	    }
	}
	export class Song {
	    id: string;
	    title: string;
	    artist: string;
	    album: string;
	    genre: string;
	    coverArt: string;
	    streamUrl: string;
	    duration: number;
	    isRecommended: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Song(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.artist = source["artist"];
	        this.album = source["album"];
	        this.genre = source["genre"];
	        this.coverArt = source["coverArt"];
	        this.streamUrl = source["streamUrl"];
	        this.duration = source["duration"];
	        this.isRecommended = source["isRecommended"];
	    }
	}
	export class SpotifyTrack {
	    title: string;
	    artist: string;
	    coverUrl: string;
	
	    static createFrom(source: any = {}) {
	        return new SpotifyTrack(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.artist = source["artist"];
	        this.coverUrl = source["coverUrl"];
	    }
	}
	export class UserProfile {
	    id: string;
	    username: string;
	    avatar_url: string;
	    role: string;
	    created_at: string;
	
	    static createFrom(source: any = {}) {
	        return new UserProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.username = source["username"];
	        this.avatar_url = source["avatar_url"];
	        this.role = source["role"];
	        this.created_at = source["created_at"];
	    }
	}

}

