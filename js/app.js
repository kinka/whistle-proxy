var app = angular.module('whistle', ["whistle.services"]);
app.config(function($sceProvider) {
  $sceProvider.enabled(false);
});
app.directive('whLogger', [function() {
  return {
    link: function(scope, ele, attrs) {
      scope.logger = "";
      scope.$on('svr:accept', function(event, data) {
        scope.logger += "<span style='color: green;'>" + data + "</span>\n";
      });
      scope.$on('svr:error', function(event, data) {
        scope.logger += "<span style='color: red;'>" + data + "</span>\n";
      });

      var tid = 0;
      scope.$watch("logger", function(value) {
        clearTimeout(tid);
        tid = setTimeout(function() {
          ele[0].scrollTop = ele[0].scrollHeight;
        }, 100);
      })
    }
  };
}]);
app.controller('ProxyCtrl', ['$scope', '$sce', '$timeout', 'fs', 'svr', function($scope, $sce, $timeout, fs, svr) {
    // about server
    svr.getNetworkList().then(function(intfs) {
      $scope.hosts = intfs || [];
      $scope.hosts.splice(0, 0, {address: "127.0.0.1"});
      $scope.host = intfs[0].address;
      $scope.port = "8888";
    });
    
    $scope.servers = {};
    $scope.server = "";
    $scope.onStart = function() {
      $scope.server = $scope.servers[$scope.host+':'+$scope.port] = svr.getInstance();
      $scope.server.start($scope.entries[$scope.entry], $scope.host, $scope.port).then(function(data) {
        $scope.running = $scope.server.isListening;
      })
    }
    
    $scope.onStop = function() {
      $scope.server.stop();
      $scope.running = $scope.server.isListening;
    }
    
    // clean ups
    $scope.$on('$destroy', function() {
      for (var key in $scope.servers)
        $scope.servers[key].stop();
    });
    
    // about entries
    fs.getEntries().then(function(entries) {
      $scope.entries = entries;
      $scope.onServerChange();
    });
    
    $scope.onServerChange = function(type) {
      if (type == 'both') {
        $scope.host = $scope.server.host;
        $scope.port = $scope.server.port;
      } else {
        $scope.server = $scope.servers[$scope.host+':'+$scope.port] || {isListening: false};
      }
      
      $scope.running = $scope.server.isListening;
        
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
        $scope.entries[entry.path] = entry.id;
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