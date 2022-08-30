const worker = new Worker("./worker.js");
const configuration = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 10,
};

const MAXIMUM_MESSAGE_SIZE = 65535;
const END_OF_FILE_MESSAGE = "EOF";
const USER = {
  receiver: "receiver",
  sender: "sender",
};

let localConnection;
let remoteConnection;
let sendChannel;
let receiveChannel;
let fileReader;
let roomId;
let percentage;
let analytics;

const bitrateDiv = document.querySelector("div#bitrate");

const progressDOM = document.querySelector("#progress-container");
const progressHeaderDOM = document.querySelector(".progress_header");
const titleDOM = document.querySelector("#post-title");
const currentRoomDOM = document.querySelector("#current-room");
const dropAreaDOM = document.querySelector("#file-picker-container");
const downloadAnchor = document.querySelector("a#download");
const fileInput = document.querySelector("#localFile");

let receiveBuffer = [];
let receivedSize = 0;

let bytesPrev = 0;
let timestampPrev = 0;
let timestampStart;
let statsInterval = null;
let bitrateMax = 0;

let fileSize;
let fileName;

async function init() {
  progressDOM.style.display = "none";
  currentRoomDOM.style.display = "none";

  fileEventListeners();

  if (window.location.hash) {
    titleDOM.innerText = "Download!";
    dropAreaDOM.style.display = "none";
    receipent = USER.receiver;
    const roomId = window.location.hash.slice(1);
    await joinRoomById(roomId);
  } else {
    receipent = USER.sender;
    titleDOM.innerText = "Upload!";
    dropAreaDOM.style.display = "block";
  }

  analytics = firebase.analytics();
  analytics.logEvent(`Initialised`, { userType: receipent });
}

function fileEventListeners() {
  fileInput.addEventListener("change", createRoom);

  const handleDrop = (e) => {
    if (e.dataTransfer.files) {
      file = e.dataTransfer.files[0];
      createRoom();
    }
  };
  const droparea = document.querySelector(".droparea");
  const active = () => droparea.classList.add("active-border");
  const inactive = () => droparea.classList.remove("active-border");
  const prevents = (e) => e.preventDefault();
  ["dragenter", "dragover", "dragleave", "drop"].forEach((evtName) => {
    droparea.addEventListener(evtName, prevents);
  });
  ["dragenter", "dragover"].forEach((evtName) => {
    droparea.addEventListener(evtName, active);
  });
  ["dragleave", "drop"].forEach((evtName) => {
    droparea.addEventListener(evtName, inactive);
  });
  droparea.addEventListener("drop", handleDrop);
  droparea.addEventListener("click", () => {
    document.querySelector("#localFile").click();
  });
}

function genId(size) {
  var result = "";
  var characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var charactersLength = characters.length;
  for (var i = 0; i < size; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

const createPeerConnection = (candidateCollection) => {
  const pc = new RTCPeerConnection(configuration);
  pc.onicecandidate = (iceEvent) => {
    if (!iceEvent.candidate) {
      console.log("Got final candidate!");
      return;
    }
    console.log("Got candidate: ", iceEvent.candidate);
    candidateCollection.add(iceEvent.candidate.toJSON());
  };

  return pc;
};

function registerPeerConnectionListeners(peerConnection) {
  peerConnection.addEventListener("icegatheringstatechange", () => {
    console.log(
      `ICE gathering state changed: ${peerConnection.iceGatheringState}`
    );
  });

  peerConnection.addEventListener("connectionstatechange", () => {
    console.log(`Connection state change: ${peerConnection.connectionState}`);
    if (
      ["failed", "disconnected"].indexOf(peerConnection.connectionState) !== -1
    ) {
      document.location.href = document.location.origin;
    } else {
      currentRoomDOM.style.display = "none";
      dropAreaDOM.style.display = "none";
      progressDOM.style.display = "block";
    }
  });

  peerConnection.addEventListener("signalingstatechange", () => {
    console.log(`Signaling state change: ${peerConnection.signalingState}`);
  });

  peerConnection.addEventListener("iceconnectionstatechange ", () => {
    console.log(
      `ICE connection state change: ${peerConnection.iceConnectionState}`
    );
  });
}

async function createRoom() {
  const db = firebase.firestore();
  const roomId = genId(7);
  const roomRef = await db.collection("rooms").doc(roomId);

  const callerCandidatesCollection = roomRef.collection("callerCandidates");
  localConnection = createPeerConnection(callerCandidatesCollection);

  sendChannel = localConnection.createDataChannel("datachannel");
  sendChannel.binaryType = "arraybuffer";

  sendChannel.addEventListener("open", onSendChannelStateChange);
  sendChannel.addEventListener("close", onSendChannelStateChange);
  sendChannel.addEventListener("error", onError);

  registerPeerConnectionListeners(localConnection);

  const offer = await localConnection.createOffer();
  await localConnection.setLocalDescription(offer);
  console.log("Created offer:", offer);
  const roomWithOffer = {
    offer: {
      type: offer.type,
      sdp: offer.sdp,
    },
  };
  await roomRef.set(roomWithOffer);
  console.log(`New room created with SDP offer. Room ID: ${roomId}`);
  currentRoomDOM.style.display = "block";

  dropAreaDOM.style.display = "none";
  const url = `${window.location.origin}/#${roomId}`;
  document.querySelector(
    "#currentRoom"
  ).innerHTML = `Your File is ready to be shared at <code id="myInput" class="url">${url} <img src="./copy.svg" title="Click to Copy" class="copy-icon" onclick="copyText('${url}')"></code>`;

  roomRef.onSnapshot(async (snapshot) => {
    const data = snapshot.data();
    if (!localConnection.currentRemoteDescription && data && data.answer) {
      console.log("Got remote description: ", data.answer);
      const rtcSessionDescription = new RTCSessionDescription(data.answer);
      await localConnection.setRemoteDescription(rtcSessionDescription);
    }
  });

  roomRef.collection("calleeCandidates").onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === "added") {
        let data = change.doc.data();
        console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
        await localConnection.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
}
function copyText(text) {
  navigator.clipboard.writeText(text);

  /* Alert the copied text */
  alert("URL Copied: " + text);
}

async function joinRoomById(roomId) {
  const db = firebase.firestore();
  const roomRef = db.collection("rooms").doc(`${roomId}`);
  const roomSnapshot = await roomRef.get();
  console.log("Got room:", roomSnapshot.exists);

  if (roomSnapshot.exists) {
    console.log("Create PeerConnection with configuration: ", configuration);
    const calleeCandidatesCollection = roomRef.collection("calleeCandidates");
    remoteConnection = createPeerConnection(calleeCandidatesCollection);
    remoteConnection.addEventListener("datachannel", receiveChannelCallback);
    registerPeerConnectionListeners(remoteConnection);

    const offer = roomSnapshot.data().offer;
    console.log("Got offer:", offer);
    await remoteConnection.setRemoteDescription(
      new RTCSessionDescription(offer)
    );
    const answer = await remoteConnection.createAnswer();
    console.log("Created answer:", answer);
    await remoteConnection.setLocalDescription(answer);

    const roomWithAnswer = {
      answer: {
        type: answer.type,
        sdp: answer.sdp,
      },
    };
    await roomRef.update(roomWithAnswer);
    roomRef.collection("callerCandidates").onSnapshot((snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
          let data = change.doc.data();
          console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
          await remoteConnection.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
  }
}

function sendData() {
  const file = fileInput.files[0];
  fileName = file.name;
  fileSize = file.size;
  console.log(
    `File is ${[fileName, fileSize, file.type, file.lastModified].join(" ")}`
  );

  // Handle 0 size files.
  dropAreaDOM.textContent = "";
  downloadAnchor.textContent = "";
  if (fileSize === 0) {
    bitrateDiv.innerHTML = "";
    dropAreaDOM.textContent = "File is empty, please select a non-empty file";
    closeDataChannels();
    return;
  }
  // sendProgress.max = fileSize;
  // receiveProgress.max = fileSize;
  const chunkSize = 16384;
  fileReader = new FileReader();
  let offset = 0;
  sendChannel.send(
    JSON.stringify({ name: fileName, size: fileSize, status: "init" })
  );
  fileReader.addEventListener("error", (error) =>
    console.error("Error reading file:", error)
  );
  fileReader.addEventListener("abort", (event) =>
    console.log("File reading aborted:", event)
  );
  fileReader.addEventListener("load", (e) => {
    console.log("FileRead.onload ", e);
    sendChannel.send(e.target.result);
    offset += e.target.result.byteLength;
    // sendProgress.value = offset;

    const percent = Math.round((offset * 100) / fileSize);
    updateProgressBar(percent);
    if (offset < fileSize) {
      readSlice(offset);
    }
  });
  const readSlice = (o) => {
    console.log("readSlice ", o);
    const slice = file.slice(offset, o + chunkSize);
    fileReader.readAsArrayBuffer(slice);
  };
  readSlice(0);
}

function receiveChannelCallback(event) {
  console.log("Receive Channel Callback");
  receiveChannel = event.channel;
  receiveChannel.binaryType = "arraybuffer";
  receiveChannel.onmessage = onReceiveMessageCallback;
  receiveChannel.onopen = onReceiveChannelStateChange;
  receiveChannel.onclose = onReceiveChannelStateChange;

  receivedSize = 0;
  bitrateMax = 0;
  downloadAnchor.textContent = "";
  downloadAnchor.removeAttribute("download");
  if (downloadAnchor.href) {
    URL.revokeObjectURL(downloadAnchor.href);
    downloadAnchor.removeAttribute("href");
  }
}

async function displayStats(peerConnection) {
  if (peerConnection && peerConnection.iceConnectionState === "connected") {
    const stats = await peerConnection.getStats();
    let activeCandidatePair;
    stats.forEach((report) => {
      if (report.type === "transport") {
        activeCandidatePair = stats.get(report.selectedCandidatePairId);
      }
    });
    if (activeCandidatePair) {
      if (timestampPrev === activeCandidatePair.timestamp) {
        return;
      }
      // calculate current bitrate
      const bytesNow = activeCandidatePair.bytesReceived;
      const bitrate = Math.round(
        ((bytesNow - bytesPrev) * 8) /
          ((activeCandidatePair.timestamp - timestampPrev) * 1000)
      );
      bitrateDiv.innerHTML = `<strong>Current Bitrate:</strong> ${bitrate} mbits/sec`;
      timestampPrev = activeCandidatePair.timestamp;
      bytesPrev = bytesNow;
      if (bitrate > bitrateMax) {
        bitrateMax = bitrate;
      }
    }
  }
}

function readableBytes(x) {
  const units = ["bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  let l = 0,
    n = parseInt(x, 10) || 0;
  while (n >= 1024 && ++l) {
    n = n / 1024;
  }
  return n.toFixed(n < 10 && l > 0 ? 1 : 0) + " " + units[l];
}

async function onSendChannelStateChange() {
  if (sendChannel) {
    const { readyState } = sendChannel;
    console.log(`Send channel state is: ${readyState}`);
    if (readyState === "open") {
      sendData();

      timestampStart = new Date().getTime();
      timestampPrev = timestampStart;
      statsInterval = setInterval(displayStats, 500);
      await displayStats(localConnection);
    }
  }
}

function onError(error) {
  if (sendChannel) {
    console.error("Error in sendChannel:", error);
    return;
  }
  console.log("Error in sendChannel which is already closed:", error);
}

async function onReceiveChannelStateChange() {
  if (receiveChannel) {
    const readyState = receiveChannel.readyState;
    console.log(`Receive channel state is: ${readyState}`);
    if (readyState === "open") {
      timestampStart = new Date().getTime();
      timestampPrev = timestampStart;
      statsInterval = setInterval(displayStats, 500);
      await displayStats(remoteConnection);
    }
  }
}
function onReceiveMessageCallback(event) {
  console.log(`Received Message ${event.data.byteLength}`);
  try {
    let parsedData = JSON.parse(event.data);
    if (parsedData.status === "init") {
      fileSize = parsedData.size;
      fileName = parsedData.name;
      return;
    }
  } catch (error) {}

  // receiveBuffer.push(event.data);
  worker.postMessage(event.data);
  receivedSize += event.data.byteLength;
  const percent = Math.round((receivedSize * 100) / fileSize);
  updateProgressBar(percent);
  // receiveProgress.value = receivedSize;

  // we are assuming that our signaling protocol told
  // about the expected file size (and name, hash, etc).
  // const file = fileInput.files[0];
  if (receivedSize === fileSize) {
    // const received = new Blob(receiveBuffer);
    // receiveBuffer = [];
    worker.postMessage("download");
    worker.addEventListener("message", async (msg) => {
      downloadAnchor.href = URL.createObjectURL(msg.data);
      downloadAnchor.download = fileName;
      downloadAnchor.textContent = `Click to download '${fileName}' (${readableBytes(
        fileSize
      )})`;
      downloadAnchor.style.display = "block";

      const bitrate = Math.round(
        (receivedSize * 8) / (1000 * (new Date().getTime() - timestampStart))
      );
      bitrateDiv.innerHTML = `<strong>Average Bitrate:</strong> ${bitrate} mbits/sec (max: ${bitrateMax} mbits/sec)`;

      if (statsInterval) {
        clearInterval(statsInterval);
        statsInterval = null;
      }

      await closeDataChannels();
    });
  }
}

function updateProgressBar(percent) {
  progressHeaderDOM.style.setProperty("--progress-width", `${percent}%`);
  progressHeaderDOM.querySelector(
    "#progress-percentage"
  ).innerText = `${percent}%`;
}

async function closeDataChannels() {
  console.log("Closing data channels");
  if (sendChannel) {
    sendChannel.close();
    sendChannel = null;
  }
  if (receiveChannel) {
    receiveChannel.close();
    receiveChannel = null;
  }
  if (localConnection) {
    localConnection.close();
    localConnection = null;
  }
  if (remoteConnection) {
    remoteConnection.close();
    remoteConnection = null;
  }

  await clearFirestore();
}
async function clearFirestore() {
  if (roomId) {
    const db = firebase.firestore();
    const roomRef = db.collection("rooms").doc(roomId);
    const calleeCandidates = await roomRef.collection("calleeCandidates").get();
    calleeCandidates.forEach(async (candidate) => {
      await candidate.delete();
    });
    const callerCandidates = await roomRef.collection("callerCandidates").get();
    callerCandidates.forEach(async (candidate) => {
      await candidate.delete();
    });
    await roomRef.delete();
  }
}
window.addEventListener("load", init());
window.onunload = window.onbeforeunload = closeDataChannels();
