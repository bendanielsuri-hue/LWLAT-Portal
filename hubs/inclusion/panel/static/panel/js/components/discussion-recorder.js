/* Record Audio button on Panel Discussion (discussion stage only - a live
   meeting-wide recorder is a separate, not-yet-built feature). Uses
   MediaRecorder directly rather than a library: one button, one blob, one
   upload - nothing here needs waveform drawing or chunked streaming. Each
   click of Stop uploads and appends its own clip (PanelReferralRecording
   is add-only, same shape as PanelReferralNote) rather than accumulating
   multiple takes client-side into one file - simplest thing that lets a
   chair pause and resume without losing an earlier take. */
export function initDiscussionRecorder() {
    var root = document.getElementById('discussion-recorder');
    if (!root) return;

    var toggleBtn = document.getElementById('record-toggle-btn');
    var toggleLabel = document.getElementById('record-toggle-label');
    var statusEl = document.getElementById('record-status');
    var detailsEl = document.getElementById('recordings-details');
    var summaryEl = document.getElementById('recordings-summary');
    var listEl = document.getElementById('recording-list');
    var csrfInput = root.querySelector('input[name=csrfmiddlewaretoken]');
    var uploadUrl = root.dataset.uploadUrl;

    var mediaRecorder = null;
    var chunks = [];
    var startedAt = null;
    var stream = null;

    function setStatus(text) {
        statusEl.textContent = text;
        statusEl.hidden = !text;
    }

    function setIdle() {
        toggleBtn.classList.remove('btn-primary');
        toggleBtn.classList.add('btn-secondary');
        toggleBtn.disabled = false;
        toggleLabel.textContent = 'Record Audio';
    }

    function setRecording() {
        toggleBtn.classList.remove('btn-secondary');
        toggleBtn.classList.add('btn-primary');
        toggleBtn.disabled = false;
        toggleLabel.textContent = 'Stop Recording';
    }

    function stopStream() {
        if (stream) {
            stream.getTracks().forEach(function (track) { track.stop(); });
            stream = null;
        }
    }

    function appendRecordingRow(data) {
        var li = document.createElement('li');
        li.className = 'recording-list-item';
        var audio = document.createElement('audio');
        audio.controls = true;
        audio.preload = 'none';
        audio.src = data.url;
        var meta = document.createElement('span');
        meta.className = 'entity-meta';
        meta.textContent = data.created_at + ' · ' + data.recorded_by;
        li.appendChild(audio);
        li.appendChild(meta);
        listEl.appendChild(li);
        detailsEl.hidden = false;
        summaryEl.textContent = 'Recordings (' + listEl.children.length + ')';
    }

    function uploadRecording(blob) {
        var durationSeconds = Math.round((Date.now() - startedAt) / 1000);
        var body = new FormData();
        body.append('csrfmiddlewaretoken', csrfInput.value);
        body.append('audio', blob, 'recording.webm');
        body.append('duration_seconds', String(durationSeconds));

        setStatus('Uploading...');
        fetch(uploadUrl, { method: 'POST', body: body })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.success) {
                    appendRecordingRow(data);
                    setStatus('');
                } else {
                    setStatus(data.error || 'Upload failed.');
                }
            })
            .catch(function () { setStatus('Upload failed.'); });
    }

    function startRecording() {
        if (!navigator.mediaDevices || !window.MediaRecorder) {
            setStatus('Recording is not supported in this browser.');
            return;
        }
        toggleBtn.disabled = true;
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(function (mediaStream) {
                stream = mediaStream;
                chunks = [];
                mediaRecorder = new MediaRecorder(mediaStream);
                mediaRecorder.addEventListener('dataavailable', function (e) {
                    if (e.data && e.data.size > 0) chunks.push(e.data);
                });
                mediaRecorder.addEventListener('stop', function () {
                    stopStream();
                    var blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
                    uploadRecording(blob);
                });
                startedAt = Date.now();
                mediaRecorder.start();
                setRecording();
                setStatus('Recording...');
            })
            .catch(function () {
                toggleBtn.disabled = false;
                setStatus('Microphone permission was denied.');
            });
    }

    function stopRecording() {
        toggleBtn.disabled = true;
        mediaRecorder.stop();
        setIdle();
    }

    toggleBtn.addEventListener('click', function () {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            stopRecording();
        } else {
            startRecording();
        }
    });

    window.addEventListener('beforeunload', function () {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
    });
}
