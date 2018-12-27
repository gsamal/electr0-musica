const mainApp = angular.module('mainApp', ['ngFileUpload']);

mainApp.run(($rootScope) => {
    $rootScope.appName = 'Electro Musica';
    $rootScope.keyNotes = {};

    // Load notes JSON
    $.getJSON("assets/notes.json", function (json) {
        $rootScope.keyNotes = json;
    });
});

mainApp.controller('MainCtrl', ($rootScope, $scope) => {
    // $scope.appMode = 'Sounds';
    // $scope.appMode = 'Editor';
    $scope.appMode = 'MainLine';
    // $scope.appMode = 'Synth';

    $scope.currentProject = {
        Title: 'My Project',
        configuration: {
            tracks: []
        }
    };
});

