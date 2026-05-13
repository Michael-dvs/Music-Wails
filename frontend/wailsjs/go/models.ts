export namespace main {
	
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

}

