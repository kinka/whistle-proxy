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
    
    var servers = {};
    var server;
    $scope.onStart = function() {
      server = servers[$scope.host+':'+$scope.port] = svr.getInstance();
      server.start($scope.entries[$scope.entry], $scope.host, $scope.port).then(function(data) {
        $scope.running = server.isListening;
      })
    }
    
    $scope.onStop = function() {
      server.stop();
      $scope.running = server.isListening;
    }
    
    // about logger
    // todo: scrollByLines
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
      $scope.onServerChange();
    });
    
    $scope.onServerChange = function() {
      server = servers[$scope.host+':'+$scope.port] || {isListening: false};
      $scope.running = server.isListening;
        
      svr.getLastEntry($scope.host, $scope.port).then(function(lastEntry) {
        if (!lastEntry) return;
        
        $scope.entry = "/" + lastEntry.substr(lastEntry.indexOf(":")+1);
      });
    }
    
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