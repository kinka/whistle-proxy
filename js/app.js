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
  
  travers.cnt = 0;
  function travers(entry, filesMap, delay) {
    if (entry.name.indexOf(".") == 0) return;
    travers.cnt++;
    if (entry.isDirectory) {
      travers.cnt--;
      entry.createReader().readEntries(function(entries) {
        entries.forEach(function(e) {
          travers(e, filesMap, delay);
        });
      })
    } else {
      var key = entry.fullPath.substr(entry.fullPath.indexOf('/', 1)).toLocaleLowerCase();
      entry.file(function(file) {
        filesMap[key] = file;
        travers.cnt--;
        if (travers.cnt == 0) {
          delay.resolve(filesMap);
        }
      });
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
      travers(entry, {'/': entry}, delay);
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
  var svrSocketId;
  var filesMap = {};
  var dir = "";
  var host = "127.0.0.1";
  var port = "8888";
  var isListening = true;
  
  function stringToUint8Array(string) {
    var buffer = new ArrayBuffer(string.length);
    var view = new Uint8Array(buffer);
    for(var i = 0; i < string.length; i++) {
      view[i] = string.charCodeAt(i);
    }
    return view;
  }
  
  function arrayBufferToString(buffer) {
    var str = '';
    var uArrayVal = new Uint8Array(buffer);
    for(var s = 0; s < uArrayVal.length; s++) {
      str += String.fromCharCode(uArrayVal[s]);
    }
    return str;
  }
  
  function initLocalFiles(entryId) {
    var delay = $q.defer();
    
    fs.getFilesMap(entryId).then(function(_filesMap) {
      dir = _filesMap['/'].fullPath;
      delete _filesMap['/'];
      filesMap = _filesMap;
      
      delay.resolve();
    });
    
    return delay.promise;
  }
  
  function onAccept(info) {
    if (svrSocketId != info.socketId)
      return;
    console.log(info)
    tcp.sockets.tcp.getInfo(info.clientSocketId, function(socketInfo) {
      console.log(socketInfo)
    })
    tcp.onReceive.addListener(onReceive);
    tcp.send(info.clientSocketId, stringToUint8Array("hello"), function() {
      tcp.close(info.clientSocketId);
    })
  }
  function onReceive(info) {
    console.log('onReceive', info)
    var recv = arrayBufferToString(info.data);
    console.log(recv)
  }
  
  function start(entryId, _host, _port) {
    host = _host || "127.0.0.1";
    port = _port || 8888;
    
    if (!entryId) {
      console.log("no local selected");
      return;
    }
    
    storage.set({'last_entry': entryId});
    initLocalFiles(entryId);
    
    var delay = $q.defer();

    tcpServer.create({}, function(socketInfo) {
      svrSocketId = socketInfo.socketId;
      
      tcpServer.onAccept.addListener(onAccept);
      
      tcpServer.listen(svrSocketId, host, parseInt(port), 50, function(result) {
        console.log(result, svrSocketId)
        isListening = true;
        delay.resolve({'result': result, 'root': dir, 'socketInfo': socketInfo});  
      });
    });
    
    return delay.promise;
  }
  
  function stop() {
    isListening = false;
    tcpServer.onAccept.removeListener(onAccept);
    tcpServer.close(svrSocketId);
    svrSocketId = 0;
  }
  
  function getNetworkList() {
    var delay = $q.defer();
    
    socket.getNetworkList(function(interfaces) {
      delay.resolve(interfaces.filter(function(intf) {
        return intf.prefixLength == 24;
      }));
    });
    
    return delay.promise;
  }
  
  function getLastEntry() {
    var delay = $q.defer();
    storage.get(function(data) {
      delay.resolve(data.last_entry);
    });
    return delay.promise;
  }
  
  return {
    start: start,
    stop: stop,
    getNetworkList: getNetworkList,
    getLastEntry: getLastEntry
  }
}]);

var app = angular.module('whistle', ["whistle.services"]);
app.config(function($sceProvider) {
  $sceProvider.enabled(false);
});
app.controller('ProxyCtrl', ['$scope', '$sce', '$timeout', 'fs', 'svr', function($scope, $sce, $timeout, fs, svr) {
    // about server
    svr.getNetworkList().then(function(intfs) {
      $scope.hosts = intfs || [];
      $scope.hosts.splice(0, 0, {address: "127.0.0.1"});
      $scope.host = intfs[0].address;
      $scope.port = "8888";
    });
    
    $scope.onStart = function() {
      svr.start($scope.entries[$scope.entry], $scope.host, $scope.port).then(function(data) {
        $scope.root = data.root;
        $scope.running = true;
      })
    }
    
    $scope.onStop = function() {
      svr.stop();
      $scope.running = false;
    }
    
    // about logger
    $scope.logger = "";
    $scope.$on('svr:accept', function(event, data) {
      $scope.logger += "<span style='color: green;'>" + data + "</span>\n";
    });
    $scope.$on('svr:error', function(event, data) {
      $scope.logger += "<span style='color: red;'>" + data + "</span>\n";
    });
    
    // about entries
    fs.getEntries().then(function(entries) {
      $scope.entries = entries;
      
      svr.getLastEntry().then(function(lastEntry) {
        if (!lastEntry) return;
        $scope.entry = "/" + lastEntry.substr(lastEntry.indexOf(":")+1);
      });
    });
    
    $scope.onEntryChange = function() {
      console.log($scope.entry)
    }
    $scope.onAddEntry = function() {
      fs.chooseEntry().then(function(entry) {
        $scope.entries[entry.path] = entry;
        $scope.entry = entry.path;
        console.log(entry)
      })
    }
    $scope.onDelEntry = function() {
      var path = $scope.entry,
          id = $scope.entries[path];
      fs.deleteEntry($scope.entries, {id: id, path: path});
    }
}]);