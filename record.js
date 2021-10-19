
let microphoneIsWiredUp = false;
let microphoneAccessIsNotAllowed = undefined;
let uploadMicrophoneData = false;
let suppressNoise = false;
let addNoise = false;
let mediaStream = null;

let Module = null;
function stopMicrophone() {
  if (!microphoneIsWiredUp) {
    return;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => {
      track.stop();
    });
  }
  microphoneIsWiredUp = false;
}

function getMicrophoneAccess() {
  if (microphoneIsWiredUp) {
    return;
  }
  var audioContext;
  try {
    window.AudioContext = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContext();
  } catch (e) {
    alert('Web Audio API is not supported in this browser.');
  }

  // Check if there is microphone input.
  navigator.getUserMedia = navigator.getUserMedia ||
                           navigator.webkitGetUserMedia ||
                           navigator.mozGetUserMedia ||
                           navigator.msGetUserMedia;
  if (!navigator.getUserMedia) {
    alert("getUserMedia() is not supported in your browser.");
    return;
  }
  var inputBuffer = [];
  var outputBuffer = [];
  var bufferSize = 16384;
  var sampleRate = audioContext.sampleRate;
  var processingNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
  var noiseNode = audioContext.createScriptProcessor(bufferSize, 1, 1);

  noiseNode.onaudioprocess = function (e) {
    var input = e.inputBuffer.getChannelData(0);
    var output = e.outputBuffer.getChannelData(0);
    for (let i = 0; i < input.length; i++) {
      if (addNoise) {
        output[i] = input[i] + (Math.random() / 100);  
      } else {
        output[i] = input[i];
      }
    }
  };

  function removeNoise(buffer) {
    let ptr = Module.ptr;
    let st = Module.st;
    for (let i = 0; i < 480; i++) {
      Module.HEAPF32[(ptr >> 2) + i] = buffer[i] * 32768;
    }
    Module._rnnoise_process_frame(st, ptr, ptr);
    for (let i = 0; i < 480; i++) {
      buffer[i] = Module.HEAPF32[(ptr >> 2) + i] / 32768;
    }
  }
  
  let frameBuffer = [];

  processingNode.onaudioprocess = function (e) {
    var input = e.inputBuffer.getChannelData(0);
    var output = e.outputBuffer.getChannelData(0);

    // Drain input buffer.
    for (let i = 0; i < bufferSize; i++) {
      inputBuffer.push(input[i]);
    }

    while (inputBuffer.length >= 480) {
      for (let i = 0; i < 480; i++) {
        frameBuffer[i] = inputBuffer.shift();
      }
      // Process Frame
      if (suppressNoise) {
        removeNoise(frameBuffer);
      }
      for (let i = 0; i < 480; i++) {
        outputBuffer.push(frameBuffer[i]);
      }
    }
    // Not enough data, exit early, etherwise the AnalyserNode returns NaNs.
    if (outputBuffer.length < bufferSize) {
      return;
    }
    // Flush output buffer.
    for (let i = 0; i < bufferSize; i++) {
      output[i] = outputBuffer.shift();
    }
  }

  // Get access to the microphone and start pumping data through the graph.
  navigator.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    }
  }, function (stream) {
    mediaStream = stream;
    var microphone = audioContext.createMediaStreamSource(stream);
    var sourceAnalyserNode = audioContext.createAnalyser();
    var destinationAnalyserNode = audioContext.createAnalyser();
    sourceAnalyserNode.smoothingTimeConstant = 0;
    destinationAnalyserNode.smoothingTimeConstant = 0;

    sourceAnalyserNode.fftSize = 1024;
    destinationAnalyserNode.fftSize = 1024;

    microphone.connect(noiseNode);
    noiseNode.connect(sourceAnalyserNode);
    sourceAnalyserNode.connect(processingNode);
    processingNode.connect(destinationAnalyserNode);

    destinationAnalyserNode.connect(audioContext.destination);
    microphoneIsWiredUp = true;
  }, function (e) {
    if (e.name === "PermissionDeniedError") {
      microphoneAccessIsNotAllowed = true;
      alert("You'll need to provied access to your microphone for this web page to work.");
    }
  });
}

let uploadedPackets = 0;
function postData(arrayBuffer) {
  let streamingStatus = document.getElementById("streaming_status");
  var fd = new FormData();
  fd.append("author", "Fake Name");
  fd.append("attachment1", new Blob([arrayBuffer]));
  var xhr = new XMLHttpRequest();
  xhr.open("POST", "https://demo.xiph.org/upload");
  xhr.onload = function (event) {
    uploadedPackets++;
    streamingStatus.innerText = "Donated " + uploadedPackets + " seconds of noise (of 60).";
    if (uploadedPackets >= 60) {
      stopStreaming();
      stopMicrophone();
    }
  };
  xhr.send(fd);
}

function stopStreaming() {
  return;
}

function startStreaming() {
  console.log('Start Streaming');
  let streamingButton = document.getElementById("streaming_button");
  let streamingStatusIcon = document.getElementById("streaming_status_icon");
  streamingStatusIcon.style.visibility = "visible";
  uploadMicrophoneData = true;
  streamingButton.innerText = "Stop donating my noise!";
}

function toggleStreaming() {
  getMicrophoneAccess();
  if (uploadMicrophoneData) {
    stopStreaming();
  } else {
    startStreaming();
  }
}

function initializeNoiseSuppressionModule() {
  if (Module) {
    return;
  }
  Module = {
    noExitRuntime: true,
    noInitialRun: true,
    preInit: [],
    preRun: [],
    postRun: [function () {
      console.log(`Loaded Javascript Module OK`);
    }],
    memoryInitializerPrefixURL: "bin/",
    arguments: ['input.ivf', 'output.raw']
  };
  NoiseModule(Module);
  Module.st = Module._rnnoise_create();
  Module.ptr = Module._malloc(480 * 4);
}

function toggleNoise() {
  addNoise = !addNoise;
}

var selectedLiveNoiseSuppression = null;
function liveNoiseSuppression(type, item) {
  if (selectedLiveNoiseSuppression) selectedLiveNoiseSuppression.classList.remove("selected");
  selectedLiveNoiseSuppression = item;
  item.classList.add("selected");
  if (type == 0) {
    stopMicrophone();
    return;
  }    
  getMicrophoneAccess();
  initializeNoiseSuppressionModule();
  stopStreaming();
  if (type == 1) {
    suppressNoise = false;
  } else if (type == 2) {
    suppressNoise = true;
  }
}

var selectedLiveNoise = null;
function liveNoise(type, item) {
  addNoise = !!type;
  if (selectedLiveNoise) selectedLiveNoise.classList.remove("selected");
  selectedLiveNoise = item;
  item.classList.add("selected");
}



// Disable demo when changing tabs.

var hidden, visibilityChange; 
if (typeof document.hidden !== "undefined") { // Opera 12.10 and Firefox 18 and later support 
  hidden = "hidden";
  visibilityChange = "visibilitychange";
} else if (typeof document.msHidden !== "undefined") {
  hidden = "msHidden";
  visibilityChange = "msvisibilitychange";
} else if (typeof document.webkitHidden !== "undefined") {
  hidden = "webkitHidden";
  visibilityChange = "webkitvisibilitychange";
}
function handleVisibilityChange() {
  if (document[hidden]) {
    liveNoiseSuppression(0, document.getElementById("default_live_noise_suppression"));
  }
}
// Warn if the browser doesn't support addEventListener or the Page Visibility API
if (typeof document.addEventListener !== "undefined" && typeof document[hidden] !== "undefined") {
  // Handle page visibility change   
  document.addEventListener(visibilityChange, handleVisibilityChange, false);
}
