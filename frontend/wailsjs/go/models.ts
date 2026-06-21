export namespace main {
	
	export class FileInfo {
	    path: string;
	    modifiedTime: number;
	
	    static createFrom(source: any = {}) {
	        return new FileInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.modifiedTime = source["modifiedTime"];
	    }
	}
	export class FileTimestamp {
	    path: string;
	    timestamp: number;
	
	    static createFrom(source: any = {}) {
	        return new FileTimestamp(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.timestamp = source["timestamp"];
	    }
	}

}

