angular.module('mainApp').controller('MainLineCtrl', ($rootScope, $scope, $http, $state, $compile, $timeout, MainLinePlayer, ngToast) => {

    let secLength = 80;
    const maxHeight = 60;
    const minHeight = 10;
    let minimizedSecLength = secLength / 8;
    let trackIds = 0;

    $scope.controlFlags = {
        ready: false,
        trackLoader: false,
        retrySaving: false,
        playerStatus: 'NA'
    };

    $scope.currentProject = {};
    $scope.configuration = {
        scale: 5,
        tracks: []
    };

    function _updateSecLength() {
        secLength = 16 * $scope.configuration.scale;
        minimizedSecLength = secLength / 8;
    }

    function _fetchCurrentProject(callback) {
        const projectName = window.localStorage.getItem('currentProject');
        if (!projectName) {
            ngToast.create({
                className: 'danger',
                content: 'No recent project found.'
            });
            $state.go('welcome');
            return;
        }

        $http.get('/api/project/load', {
            params: {
                projectName: projectName
            }
        }).then(response => {
            $scope.currentProject.projectName = projectName;
            $scope.currentProject.configuration = response.data || {};
            $scope.configuration = $scope.currentProject.configuration;
            if (!$scope.configuration.scale) {
                $scope.configuration.scale = 5;
            }
            _updateSecLength();
            if (!$scope.configuration.tracks) {
                $scope.configuration.tracks = [];
            }
            _checkAllTracks(callback);
        }).catch(err => {
            ngToast.create({
                className: 'danger',
                content: 'Error while fetching recent project.'
            });
            console.error(err);
            $state.go('welcome');
        });
    };

    /**
     * Check all the saved tracks, initiate the buffer if needed.
     * @param {function} callback
     */
    function _checkAllTracks(callback) {
        if ($scope.configuration.tracks.length === 0) {
            callback()
            return;
        }

        const promiseArr = [];
        $scope.configuration.tracks.forEach(track => {
            if (!track.synthName && !track.base64Src) {
                // Not a synthesizer nor a upload
                track.loaded = true;
                return;
            }
            if (!track.synthName && track.base64Src) {
                promiseArr.push(new Promise((resolve, reject) => {
                    Utils.base64ToAudioBuffer(track.base64Src, function (err, buffer) {
                        if (err) {
                            return reject(err);
                        }
                        track.loaded = true;
                        track.audioBuffer = buffer;
                        resolve();
                    });
                }));
                return;
            }
            promiseArr.push(_loadSelectedTrack(track.synthName).then(({ trackInfo, buffer }) => {
                track.loaded = true;
                track.audioBuffer = buffer;
                // if (track.duration !== buffer.duration) {
                // track.error = true;
                // track.errorMessage = 'Duration mismatch';
                // }
            }).catch(err => {
                track.error = true;
                track.errorMessage = err.message ? err.message : String(err);
            }));
        });

        Promise.all(promiseArr).then(() => {
            callback();
        });
    }

    function _updateCurrentProject(manual) {
        $scope.controlFlags.retrySaving = false;
        const configuration = {
            tracks: []
        };

        $scope.configuration.tracks.forEach(track => {
            const trackCopy = Object.assign({}, track);
            delete trackCopy.id;
            delete trackCopy.audioBuffer;
            delete trackCopy.loaded;
            delete trackCopy.error;
            delete trackCopy.errorMessage;
            trackCopy.segments = [];

            track.segments.forEach(seg => {
                trackCopy.segments.push({
                    start: seg.start,
                    end: seg.end,
                    offset: seg.offset,
                    amp: seg.amp
                });
            });

            configuration.tracks.push(trackCopy);
        });

        $http.post('/api/project', {
            projectName: $scope.currentProject.projectName,
            configuration: configuration
        }).then(() => {
            console.log('Project is saved', new Date());
        }).catch(() => {
            console.error('Problem while saving the project.');
            if (manual) {
                ngToast.create({
                    className: 'danger',
                    content: 'Error while saving the project.'
                });
            }
            $scope.controlFlags.retrySaving = true;
        });
    }

    $scope.retrySaving = function () {
        _updateCurrentProject(true);
    };

    $scope.$on('Project:Save:Trigger', () => {
        _updateCurrentProject();
    });

    $scope.openSynthesizer = function () {
        $scope.controlFlags.trackLoader = true;
        $("html, body").animate({ scrollTop: 0 }, 500);
    };

    $scope.closeSynthesizer = function () {
        $scope.controlFlags.trackLoader = false;
        $scope.loadSavedTracks();
    };

    $scope.removeTrack = function (index) {
        if ($scope.configuration.tracks && $scope.configuration.tracks[index]) {
            $scope.configuration.tracks.splice(index, 1);
            _refreshTrack();
        }
    };

    $scope.updateScale = function () {
        _updateSecLength();
        _refreshTrack();
    };

    function _getMaxTrackTime() {
        if (!$scope.configuration.tracks || $scope.configuration.tracks.length === 0) {
            return 0;
        }

        let maxTime = 0;
        $scope.configuration.tracks.forEach(track => {
            track.segments.forEach(seg => {
                maxTime = Math.max(maxTime, (seg.offset + seg.end - seg.start));
            });
        });
        console.log('Max time----', maxTime);
        return (maxTime + 10);
    }

    const fillTimeLines = function () {
        const maxTime = Math.max(_getMaxTrackTime(), 50);
        $('#editor-panel .scale').html('');
        const panelWidth = $('#editor-panel .scale').width() - 100;
        const secPanels = Math.max(parseInt(panelWidth / secLength), parseInt(maxTime));

        for (let i = 0; i <= secPanels; i++) {
            $('#editor-panel .scale').append(`<div class="scale-sec" style="width:${secLength}px;">${i}</div>`);
        }

        $('#editor .scale').css('display', 'inline-flex');
    };

    const fillConfiguration = function () {
        $scope.configuration.tracks.forEach((track, index) => {
            _addTrack(track, index);
            _addTrackElems(track);
        });
    };

    function _addTrack(track, index) {
        // Add a unique id;
        track.id = 'track' + (trackIds++);
        const mainTrack = $('#editor-panel .tracks');
        mainTrack.append($compile(`<div class="track" style="height: ${maxHeight}px;">
        ${track.name}
        <span style="float: right;">
            <i class="fa"
                title="mute/unmute"
                ng-class="{'fa-volume-off': configuration.tracks[${index}].mute,'fa-volume-up': !configuration.tracks[${index}].mute}"
                ng-click="configuration.tracks[${index}].mute = !configuration.tracks[${index}].mute" style="cursor: pointer;"
                aria-hidden="true"></i>
            <i class="fa fa-trash" title="remove track" ng-click="removeTrack(${index});" style="cursor: pointer;" aria-hidden="true"></i>
        </span>
        </div>`)($scope));

        const parentWidth = $('#editor-panel .scale').width();

        // Add timeers
        $('#editor-panel .timeline').append(`<div class="track-timing" id="track-path-${track.id}" track-id="${track.id}" style="width: ${parentWidth}px;height: ${maxHeight}px"></div>`);
    }

    function _addTrackElems(track) {
        //Clear previous elems
        $(`#track-path-${track.id}`).html('');
        const segments = track.segments;
        const maxWidthInPx = +((track.duration * secLength).toFixed(2));
        segments.forEach((seg, index) => {
            if (!seg.amp) {
                seg.amp = 1;
            }
            seg.startInPx = +((seg.start * secLength).toFixed(2));
            seg.endInPx = +((seg.end * secLength).toFixed(2));
            seg.offsetInPx = +((seg.offset * secLength).toFixed(2));
            seg.heightInPx = +((seg.amp * maxHeight).toFixed(2));
            // DODO : height of tracker on change of height.
            const elem = $(`<span class="tracker text-center" segment-index="${index}"
                style="min-width: ${minimizedSecLength}px; max-width: ${maxWidthInPx}px; width: ${seg.endInPx - seg.startInPx}px;min-height: ${minHeight}px;height: ${seg.heightInPx}px;">
                <span style="position:relative;display:block;">
                <canvas height="${seg.heightInPx}px" width="${maxWidthInPx}" style="position: absolute;top:0px;left:-${seg.startInPx}px;"></canvas>
                <span class="start">${seg.start.toFixed(2)}</span> - <span class="end">${seg.end.toFixed(2)}</span>
                </span>
                </span>`);
            $(`#track-path-${track.id}`).append(elem);

            $(elem).css('left', seg.offsetInPx + 'px');

            _renderWaveForm($(elem).find('canvas')[0], track.audioBuffer);

            // return;

            $(elem).draggable({
                containment: "parent",
                axis: "x",
                // grid: [minimizedSecLength, 0],
                drag: function (event, ui) {
                    // Prevent overlap
                },
                stop: function (event, ui) {
                    console.log('Drag stop : ', ui.position);
                    _updateSegmentPositions();
                    console.log('Drag stop : ', seg);
                    $scope.$digest();
                }
            });
            $(elem).resizable({
                containment: `#track-path-${track.id}`,
                handles: "e, w, n",
                // grid: [minimizedSecLength, 0],
                maxWidth: maxWidthInPx,
                resize: function (event, ui) {
                    // console.log('Resize start : ', ui);
                    // console.log('Resize start : ', seg);

                    let start = seg.start;
                    let end = seg.end;

                    const leftChange = +(((ui.position.left - seg.left) / secLength).toFixed(2));
                    start += leftChange;
                    console.log('Resize start Change in left : ', start, leftChange);
                    if (leftChange !== 0 && start <= 0) {
                        $(this).mouseup();
                    }

                    if (leftChange === 0) {
                        const rightChange = +(((ui.size.width - seg.width) / secLength).toFixed(2));
                        end += rightChange;
                        console.log('Resize start Change in right : ', end, rightChange);
                        if (rightChange !== 0 && end >= track.duration) {
                            $(this).mouseup();
                        }
                    }
                },
                stop: function (event, ui) {
                    // console.log('Resize stop : ', ui);
                    // console.log('Resize stop : ', seg);
                    _updateSegmentPositions(true);
                    $scope.$digest();
                }
            });

            //Set left and width;
            seg.left = $(elem)[0].offsetLeft;
            seg.width = $(elem).outerWidth();
        });

        console.log('Track added');
    }

    function getMaximumTime(trackId = null) {
        let maxTime = 0;
        $scope.configuration.tracks.forEach(track => {
            if (trackId) {
                if (track.id !== trackId)
                    return;
                track.segments.forEach(seg => {
                    maxTime = Math.max(maxTime, (seg.left + seg.width));
                });
            } else {
                track.segments.forEach(seg => {
                    maxTime = Math.max(maxTime, (seg.left + seg.width));
                });
            }
        });
        return +((maxTime / secLength).toFixed(2));
    };

    function removeTrackSegment(trackId, segmentNo) {
        segmentNo = parseInt(segmentNo);
        const track = $scope.configuration.tracks.find(t => t.id === trackId);
        if (!track) {
            ngToast.create({
                className: 'danger',
                content: 'Invalid Track.'
            });
            return;
        }

        if (track.segments && track.segments[segmentNo]) {
            track.segments.splice(segmentNo, 1);
            _addTrackElems(track);
        }
    }

    function addTrackSegment(trackId) {
        const track = $scope.configuration.tracks.find(t => t.id === trackId);
        if (!track) {
            ngToast.create({
                className: 'danger',
                content: 'Invalid Track.'
            });
            return;
        }

        if (!track.segments) {
            track.segments = [];
        }

        const maxTime = getMaximumTime(track.id);
        track.segments.push({
            offset: maxTime,
            start: 0,
            end: track.duration
        });
        _addTrackElems(track);
    };

    function _updateSegmentPositions(resized) {
        $('.tracker').each((ind, elem) => {
            const trackerElem = $(elem);
            const tracker = trackerElem.parent();
            const segmentNo = parseInt(trackerElem.attr('segment-index'));
            const trackId = tracker.attr('track-id');

            const track = $scope.configuration.tracks.find(t => t.id === trackId);
            if (!track) {
                return;
            }

            if (track.segments && track.segments[segmentNo]) {
                const seg = track.segments[segmentNo];
                const leftPad = +(trackerElem[0].offsetLeft);
                seg.offset = +((leftPad / secLength).toFixed(2));

                if (resized) {
                    const leftChange = +(((trackerElem[0].offsetLeft - seg.left) / secLength).toFixed(2));
                    seg.start += leftChange;
                    if (seg.start < 0) {
                        seg.start = 0;
                    }
                    console.log('Left change : ', leftChange);

                    if (!leftChange) {
                        const rightChange = +(((trackerElem.outerWidth() - seg.width) / secLength).toFixed(2));
                        seg.end += rightChange;
                        console.log('Right change : ', rightChange);
                    }
                }
                console.log('old', seg.left, seg.width)
                seg.left = trackerElem[0].offsetLeft;
                seg.width = trackerElem.outerWidth();

                console.log('new ', seg.left, seg.width);

                //Upadte pixels
                seg.startInPx = +((seg.start * secLength).toFixed(2));
                seg.endInPx = +((seg.end * secLength).toFixed(2));
                seg.offsetInPx = +((seg.offset * secLength).toFixed(2));

                trackerElem.find('.start').html('' + seg.start.toFixed(2));
                trackerElem.find('.end').html('' + seg.end.toFixed(2));
                trackerElem.find('canvas').css('left', `-${seg.startInPx}px`);

                // Check for amplitude change
                const oldAmp = seg.amp;
                seg.amp = +((trackerElem[0].clientHeight / maxHeight).toFixed(2));
                if (oldAmp !== seg.amp) {
                    trackerElem.find('canvas')[0].height = trackerElem[0].clientHeight;
                    _renderWaveForm(trackerElem.find('canvas')[0], track.audioBuffer);
                }
            }

        });
    }

    /**
     * Context menu to add or remove track segments
     */
    function updateContextMenu() {
        // $.contextMenu('update');

        $.contextMenu({
            selector: '.tracker',
            items: {
                "delete": {
                    name: "Delete",
                    callback: function (itemKey, opt, e) {
                        console.log("Clicked on ", itemKey, " on element ", opt.$trigger);
                        const elem = $(opt.$trigger[0]);
                        const segmentNo = elem.attr('segment-index');
                        const trackId = $(elem).parent().attr('track-id');

                        removeTrackSegment(trackId, segmentNo);
                        $scope.$digest();
                    }
                }
            }
        });

        $.contextMenu({
            selector: '.track-timing',
            items: {
                "addTune": {
                    name: "Add Tune",
                    callback: function (itemKey, opt, e) {
                        console.log("Clicked on ", itemKey, " on element ", opt.$trigger);
                        const elem = $(opt.$trigger[0]);
                        const trackId = $(elem).attr('track-id');

                        addTrackSegment(trackId);
                        $scope.$digest();
                    }
                }
            }
        });
    }

    $scope.loadSelectedTrack = function (syntProjectName) {
        $scope.controlFlags.ready = false;
        _loadSelectedTrack(syntProjectName).then(({ trackInfo, buffer }) => {
            const track = {
                name: trackInfo.synthName,
                synthName: trackInfo.synthName,
                audioBuffer: buffer,
                duration: buffer.duration,
                loaded: true,
                segments: []
            };
            $scope.configuration.tracks.push(track);
            // Add a default segment
            track.segments.push({
                start: 0,
                end: buffer.duration,
                offset: 0
            });
            _refreshTrack();
            ngToast.create({
                className: 'success',
                content: 'Track is added.'
            });
            $scope.controlFlags.ready = true;
            _digest();
        }).catch(err => {
            console.error(err);
            $scope.controlFlags.ready = true;
            ngToast.create({
                className: 'danger',
                content: 'Some error ocuured.'
            });
        });
    };

    $scope.loadSavedTracks = function () {
        $http.get('/api/synthesizer/list').then(res => {
            $scope.savedProjects = res.data;
        }).catch(err => {
            ngToast.create({
                className: 'danger',
                content: 'Can not load saved project. Check console for errors!'
            });
        });
    };

    $scope.parseFile = function (file) {
        $scope.controlFlags.ready = false;
        Utils.convertFileToArrayBuffer(file, function (arrayBuffer) {
            const base64Src = Utils.arrayBufferToBase64(arrayBuffer);
            Utils.base64ToAudioBuffer(base64Src, function (err, audioBuffer) {
                if (err) {
                    ngToast.create({
                        className: 'danger',
                        content: 'Unable to parse audio file.'
                    });
                    $scope.controlFlags.ready = true;
                    return;
                }
                const track = {
                    name: file.name,
                    base64Src: base64Src,
                    audioBuffer: audioBuffer,
                    duration: audioBuffer.duration,
                    loaded: true,
                    segments: [{
                        start: 0,
                        end: audioBuffer.duration,
                        offset: 0
                    }]
                };

                $scope.configuration.tracks.push(track);
                _refreshTrack();
                console.log(track);
                ngToast.create({
                    className: 'success',
                    content: 'Track is added.'
                });
                $scope.controlFlags.ready = true;
                _digest();
            });
        });
    };

    function _loadSelectedTrack(syntProjectName) {
        return new Promise((resolve, reject) => {
            $http.get('/api/track/load/bysnth', {
                params: {
                    projectName: syntProjectName
                }
            }).then(res => {
                Utils.base64ToAudioBuffer(res.data.base64Src, function (err, buffer) {
                    if (err) {
                        return reject(err);
                    }
                    resolve({
                        trackInfo: res.data,
                        buffer: buffer
                    });
                });
            }).catch(err => {
                reject(err);
            });
        });
    }

    function _renderWaveForm(canvas, buffer) {
        var leftChannel = buffer.getChannelData(0),
            width = canvas.width,
            height = canvas.height,
            ctx = canvas.getContext('2d');

        var maxSample = buffer.duration * width;
        var step = Math.ceil(leftChannel.length / maxSample)

        ctx.clearRect(0, 0, width, height);
        ctx.globalAlpha = 0.06;
        ctx.strokeStyle = '#800101';

        ctx.translate(0, height / 2);
        for (var i = 0; i < maxSample; i++) {
            // on which line do we get ?
            var x = Math.floor(width * i / maxSample);
            var y = (leftChannel[i * step] * height / 2);
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + 1, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    // Player related functions

    $scope.play = function (delay = 0, callback) {
        setTimeout(function () {
            MainLinePlayer.loadPlayback($scope.configuration.tracks, secLength);
            callback && callback();
        }, delay);
    }
    $scope.pause = function () {
        MainLinePlayer.pause($scope.configuration.tracks);
    }
    $scope.resume = function () {
        MainLinePlayer.resume($scope.configuration.tracks);
    }
    $scope.stop = function () {
        MainLinePlayer.stop($scope.configuration.tracks);
        $scope.controlFlags.startVisualization = false;
        $('body').removeClass('full-body');
    }

    function _digest() {
        $scope.$digest();
    }

    /**
     * Toggle visualization and cover body to make it fixed.
     */
    $scope.toggleVisualization = function () {
        $scope.controlFlags.startVisualization = !$scope.controlFlags.startVisualization;
        $('body').removeClass('full-body');
        if ($scope.controlFlags.startVisualization) {
            $('body').addClass('full-body');
        }
    };

    $scope.startAnim = function () {
        startAnim();
        window.showThreeContainer = function () {
            $scope.controlFlags.showAnim = true;
            _digest();
        }
        window.toggleScene = () => {
            $scope.controlFlags.showVisualization = true;
            $scope.controlFlags.showAnim = false;
            $scope.play(1500, function () {
                setupVS(MainLinePlayer.currentAnalyser);
                _digest();
            });
        }
    }

    // Listen to player events
    $scope.$on('Player:Event', (e, operation) => {
        $scope.controlFlags.playerStatus = operation;
        if (operation === 'STOP') {
            $scope.controlFlags.startVisualization = false;
            $('body').removeClass('full-body');
        }
        _digest();
    });

    $scope.$on('$destroy', () => {
        $scope.stop();
        //Unbind global event handlers
        window.showThreeContainer = () => { };
        window.toggleScene = () => { };
    });

    function _refreshTrack() {
        trackIds = 0;
        $('.track').remove();
        $('.track-timing').remove();
        fillTimeLines();
        fillConfiguration()
    }

    _fetchCurrentProject(function () {
        _refreshTrack();
        $scope.loadSavedTracks();
        updateContextMenu();
        $scope.controlFlags.ready = true;
    });
});