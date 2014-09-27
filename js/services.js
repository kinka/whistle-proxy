var services = angular.module("whistle.services", []);
services.factory("fs", ["$q", function($q) {
  var fs = chrome.fileSystem,
      local = chrome.storage.local;
  
  function _getEntries() {
    var delay = $q.defer();

    local.get(function(data) {
      delay.resolve(data.entries);
    });
    
      return delay.promise;
  }
    
  function _getEntryById(id) {
    var delay = $q.defer();

    fs.restoreEntry(id, function(entry) {
      console.log("当前代理目录：", entry.fullPath)
      delay.resolve(entry);
    });

    return delay.promise;
  }
  
  function travers(entry, delay) {
      var filesMap = {'/': entry};
      var cnt = 0;
      _travers(entry);
      function _travers(entry) {
        if (entry.name.indexOf(".") == 0) return;
        cnt++;
        if (entry.isDirectory) {
          cnt--;
          entry.createReader().readEntries(function(entries) {
            entries.forEach(function(e) {
              _travers(e);
            });
          })
        } else {
          var key = entry.fullPath.substr(entry.fullPath.indexOf('/', 1)).toLocaleLowerCase();
          entry.file(function(file) {
            filesMap[key] = file;
            cnt--;
            if (cnt == 0) {
              delay.resolve(filesMap);
            }
          });
        }
      }
  }
  
  function _getFilesMap(id) {
    var delay = $q.defer();

    fs.restoreEntry(id, function(entry) {
      if (!entry) {
        delay.reject('No entry!');
        return;
      }
      console.log("当前代理目录：", entry.fullPath)
      travers(entry, delay);
    });

    return delay.promise;
  }
  
  function _chooseEntry() {
    var delay = $q.defer();
    
    fs.chooseEntry({type: 'openDirectory'}, function(entry) {
      if (!entry) {
        delay.reject('Unable to get directory entry');
        return;
      }
      
      local.get(function(data) {
        var entries = data.entries || {};
        var id = fs.retainEntry(entry);
        entries[entry.fullPath] = id;
        local.set({'entries': entries});
        delay.resolve({id: id, path: entry.fullPath});
      })
    });
    
    return delay.promise;
  }
  
  function _deleteEntry(entries, entry) {
    delete entries[entry.path];
    local.set({'entries': entries});
    console.log(entries, entry)
  }
  
  return {
    getEntries: _getEntries,
    getFilesMap: _getFilesMap,
    chooseEntry: _chooseEntry,
    deleteEntry: _deleteEntry
  };
}]);

services.factory("svr", ["$q", "$rootScope", "fs", function($q, $rootScope, fs) {
  var socket = chrome.socket,
      tcpServer = chrome.sockets.tcpServer,
      tcp = chrome.sockets.tcp,
      storage = chrome.storage.local;
  
  function getNetworkList() {
    var delay = $q.defer();
    
    socket.getNetworkList(function(interfaces) {
      delay.resolve(interfaces.filter(function(intf) {
        return intf.prefixLength == 24;
      }));
    });
    
    return delay.promise;
  }
  
  function getLastEntry(host, port) {
    var delay = $q.defer();
    storage.get(function(data) {
      delay.resolve(data[host+':'+port]);
    });
    return delay.promise;
  }
  
  function stringToUint8Array(str, cb) {
    var delay = $q.defer();
    var bb = new Blob([str]);
    var f = new FileReader();
    f.onload = function(e) {
      cb && cb(e.target.result);
      delay.resolve(e.target.result);
    };
    f.readAsArrayBuffer(bb);
    
    return delay.promise;
  }
  
  function arrayBufferToString(buf, cb) {
    var delay = $q.defer();
    var bb = new Blob([new Uint8Array(buf)]);
    var f = new FileReader();
    f.onload = function(e) {
      cb && cb(e.target.result);
      delay.resolve(e.target.result);
    };
    f.readAsText(bb);
    
    return delay.promise;
  }
  
  function initLocalFiles(entryId) {
    var delay = $q.defer();
    
    fs.getFilesMap(entryId).then(function(filesMap) {
      var path = filesMap['/'].fullPath;
      delete filesMap['/'];

      delay.resolve({path: path, id: entryId, filesMap: filesMap});
    });
    
    return delay.promise;
  }
  
  function handleHTTP(data, socketId, filesMap) {
      if (data.indexOf('GET ') != 0)
        return false;
      var lower = data.toLocaleLowerCase();
      var keepAlive = false;
      if (lower.indexOf('connection: keep-alive') != -1)
        keepAlive = true;

      var uriEnd = data.indexOf(" ", 4);
      if (uriEnd < 0) return false;
      var uri = lower.substring(4, uriEnd);
      var q = uri.indexOf('?');
      if (q != -1)
        uri = uri.substring(0, q);
      var file = filesMap[uri];
      if (!file) {
          console.warn('File does not exist...', uri);
          $rootScope.$broadcast('svr:error', "GET 404 " + uri);
          
          writeErrorResponse(socketId, 404, keepAlive);
          return;
      }

      $rootScope.$broadcast('svr:accept', "GET 200 " + uri);
      
      write200Response(socketId, file, keepAlive);
  }
  
  function writeErrorResponse(socketId, errorCode, keepAlive) {
    var file = { size: 0 };
    var contentType = "text/plain"; //(file.type === "") ? "text/plain" : file.type;
    var contentLength = file.size;
    var headerStr = "HTTP/1.0 " + errorCode + " Not Found\nContent-length: " + contentLength + "\nContent-type:" + contentType + ( keepAlive ? "\nConnection: keep-alive" : "") + "\n\n";
    
    stringToUint8Array(headerStr).then(function(buffer) {
        tcp.send(socketId, buffer, angular.noop);
        if (!keepAlive)
            tcp.close(socketId);
    });
  }
  
  function write200Response(socketId, file, keepAlive) {
    var contentType = (file.type === "") ? "text/plain" : file.type;
    var contentLength = file.size;
    var headerStr = "HTTP/1.0 200 OK\nContent-length: " + contentLength + "\nContent-type:" + contentType + ( keepAlive ? "\nConnection: keep-alive" : "") + "\n\n";

    var fileReader = new FileReader();
    fileReader.onload = function(e) {
        var content = e.target.result;
        stringToUint8Array(headerStr).then(function(header) {
            /*var view = new Uint8Array(header.byteLength+content.byteLength);
            view.set(new Uint8Array(header), 0);
            view.set(new Uint8Array(content), header.byteLength);
            console.log('view', view.length)
            tcp.send(socketId, view.buffer, angular.noop);*/
            tcp.send(socketId, header, angular.noop);
            tcp.send(socketId, content, angular.noop);
            if (!keepAlive)
                tcp.close(socketId);
       });
    };

    fileReader.readAsArrayBuffer(file);
  }
  
  function onAccept(info) {
    if (this.svrSocketId != info.socketId)
      return;
    console.log('accept', info.socketId, info.clientSocketId)
    tcp.getInfo(info.clientSocketId, function(socketInfo) {
      tcp.setPaused(info.clientSocketId, false);
    });
    if (!this.setReceive) {
        this.setReceive = true;
        tcp.onReceive.addListener(onReceive.bind(this));
    }
    this.openSockests.push(info.clientSocketId);
  }
  
  function onReceive(info) {
    if (this.openSockests.indexOf(info.socketId) == -1)
      return;
      
    var me = this;
    arrayBufferToString(info.data).then(function(recv) {
        if (false === handleHTTP(recv, info.socketId, me.filesMap)) { // not http GET request, destroy it
            tcp.close(info.socketId);
        }
    });
  }
  
  function start(entryId, _host, _port) {
    this.host = _host || "127.0.0.1";
    this.port = _port || 8888;
    
    if (!entryId) {
      console.log("no local selected");
      return;
    }
    
    var o = {};
    o[this.host+':'+this.port] = entryId;
    storage.set(o);
    
    var me = this;
    var delay = $q.defer();
    
    initLocalFiles(entryId).then(function(entry) {
        me.dir = entry.path;
        me.filesMap = entry.filesMap;

        tcpServer.create({}, function(socketInfo) {
          me.svrSocketId = socketInfo.socketId;

          tcpServer.onAccept.addListener(onAccept.bind(me));

          tcpServer.listen(me.svrSocketId, me.host, parseInt(me.port), 1, function(result) {
            console.log(result, me.svrSocketId)
            me.isListening = true;
            delay.resolve({'result': result, 'root': me.dir, 'socketInfo': socketInfo});  
          });
        });   
    });

    return delay.promise;
  }
  
  function stop() {
    this.openSockests.forEach(function(socketId) {
        tcp.close(socketId);
    });
    this.openSockests = [];
    this.isListening = false;
    
    tcpServer.close(this.svrSocketId);
    this.svrSocketId = 0;
    
    tcpServer.onAccept.removeListener(onAccept.bind(this));
    tcp.onReceive.removeListener(onReceive.bind(this));
  }
  
  function TCPServer() {
      this.svrSocketId = 0;
      this.filesMap = {};
      this.dir = "";
      this.host = "127.0.0.1";
      this.port = "8888";
      this.isListening = true;
      this.openSockests = [];
  }
  TCPServer.prototype.start = start;
  TCPServer.prototype.stop = stop;
  
  function getInstance() {
      return new TCPServer();
  }
  
  return {
    getInstance: getInstance,
    start: start,
    stop: stop,
    getNetworkList: getNetworkList,
    getLastEntry: getLastEntry
  }
}]);
