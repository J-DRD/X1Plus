.pragma library
.import X1PlusNative 1.0 as JSX1PlusNative

var X1Plus = null;
var _X1PlusNative = JSX1PlusNative.X1PlusNative;

var OTAUpdater = {
    files: [],
    totalProgress: 0,
    currentFileIndex: 0,
    downloadInProgress: false,

    initialize: function(fileList) {
        this.files = fileList;
        this.files.forEach(function(file) {
            file.progress = 0;
            file.isDownloaded = false;
            file.md5Failed = false;
        });
    },

    startDownloads: function() {
        if (this.files.length > 0) {
            this.verifyCache(this.files[0]);
        }
    },

    verifyCache: function(file) {
        let path = _X1PlusNative.getenv("EMULATION_WORKAROUNDS") + file.localPath;
        let response = _X1PlusNative.readFile(path);
        if (response.byteLength !== 0) {
            file.isDownloaded = false;
            file.md5Failed = true;
            let calcmd5 = _X1PlusNative.md5(response);
            console.log(`[x1p] ${path}: expected md5 ${file.md5}, calculated ${calcmd5} for on disk cache`);
            if (file.md5 === calcmd5) {
                file.isDownloaded = true;
                file.md5Failed = false;
                this.downloadFile(file);
            } else {
                this.moveToNextFile();
            }
        } else {
            console.log(`[x1p] ${path}: not found on disk`);
            file.isDownloaded = false;
            file.md5Failed = false;
            this.downloadFile(file); 
        }
    },

    downloadFile: function(file) {
        this.downloadInProgress = true;
        var xhr = new XMLHttpRequest();
        console.log("Downloading " + file.url + " to " + file.localPath);
        xhr.open("GET", file.url, true);
        xhr.responseType = "arraybuffer";
        xhr.send();
        var self = this; //hopefully this avoids scoping issues for callbacks
        xhr.onload = function() {
            if (xhr.status === 200) {
                console.log(`downloaded ${xhr.response.byteLength} bytes`);
                _X1PlusNative.system("mkdir -p " + _X1PlusNative.getenv("EMULATION_WORKAROUNDS") + "/test/");
                _X1PlusNative.saveFile(_X1PlusNative.getenv("EMULATION_WORKAROUNDS") + file.localPath, xhr.response);
                file.progress = 1;
                self.moveToNextFile();
            } else {
                console.log("Download failed: " + xhr.status);
                file.progress = 0; 
                self.moveToNextFile();
            }
        };

        xhr.onerror = function() {
            console.log("Download error");
            file.progress = 0;
            self.moveToNextFile();
        };

        xhr.onprogress = function(event) {
            if (event.lengthComputable) {
                file.progress = event.loaded / event.total;
                self.emitProgressUpdate();
            }
        };
    },

    moveToNextFile: function() {
        this.currentFileIndex++;
        if (this.currentFileIndex < this.files.length) {
            this.verifyCache(this.files[this.currentFileIndex]);  
        } else {
            console.log('All files processed');
            this.downloadInProgress = false;
        }
    },

    emitProgressUpdate: function() {
        var totalLoaded = this.files.reduce(function(acc, file) {
            return acc + file.progress;
        }, 0);
        this.totalProgress = totalLoaded / this.files.length;
        console.log("Total Progress: " + (this.totalProgress * 100) + "%");
    }
};
