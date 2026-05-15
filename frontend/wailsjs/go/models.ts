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

