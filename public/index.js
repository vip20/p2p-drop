mdc.ripple.MDCRipple.attachTo(document.querySelector(".mdc-button"));
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

let peerConnection = null;
let roomId = null;
let roomDialog = null;
let downloadPercent = 0;
let uploadPercent = 0;
async function init() {
  document.querySelector("#localFile").addEventListener("change", selectFile);
  document.querySelector("#shareBtn").addEventListener("click", createRoom);
  // document.querySelector("#joinBtn").addEventListener("click", joinRoom);
  roomDialog = new mdc.dialog.MDCDialog(document.querySelector("#room-dialog"));
  if (window.location.hash) {
    const roomId = window.location.hash.slice(1);
    await joinRoomById(roomId);
  }
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
function sendFile() {
  if (file) {
    const channelLabel = file.name;
    const channel = peerConnection.createDataChannel(channelLabel);
    channel.binaryType = "arraybuffer";

    channel.onopen = async () => {
      const arrayBuffer = await file.arrayBuffer();
      const totalSize = file.size;
      for (let i = 0; i < arrayBuffer.byteLength; i += MAXIMUM_MESSAGE_SIZE) {
        uploadPercent = (i * 100) / totalSize;
        channel.send(
          JSON.stringify({
            value: arrayBuffer.slice(i, i + MAXIMUM_MESSAGE_SIZE),
            totalSize,
            processedSize: i,
          })
        );
      }
      channel.send(
        JSON.stringify({ done: true, fileName: file.name, totalSize })
      );
      hangUp();
    };
  }
}
function selectFile(e) {
  file = e.target.files[0];
}
const downloadFile = (fileName) => {
  worker.postMessage("download");
  worker.addEventListener("message", (event) => {
    console.log("download stream====>>", event);
    const stream = event.data.stream();
    const fileStream = streamSaver.createWriteStream(fileName);
    stream.pipeTo(fileStream);
  });
};

const createPeerConnection = (candidateCollection) => {
  const pc = new RTCPeerConnection(configuration);

  //   pc.onnegotiationneeded = async () => {
  //     await createAndSendOffer();
  //   };

  pc.onicecandidate = (iceEvent) => {
    if (!iceEvent.candidate) {
      console.log("Got final candidate!");
      return;
    }
    console.log("Got candidate: ", iceEvent.candidate);
    candidateCollection.add(iceEvent.candidate.toJSON());
  };

  pc.ontrack = (event) => {
    const video = document.getElementById("remote-view");
    video.srcObject = event.streams[0];
  };

  pc.ondatachannel = (event) => {
    const { channel } = event;
    channel.binaryType = "arraybuffer";

    channel.onmessage = async (event) => {
      const { data } = event;
      try {
        if (data.toString().includes("done")) {
          const parsed = JSON.parse(data);
          const fileName = parsed.fileName;
          downloadFile(fileName);
        } else {
          const parsedData = JSON.parse(data);
          downloadPercent =
            (parsedData.processedSize * 100) / parsedData.totalSize;
          worker.postMessage(data);
        }
      } catch (err) {
        console.log("File transfer failed");
      }
    };
  };

  return pc;
};
function registerPeerConnectionListeners() {
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
async function hangUp() {
  if (peerConnection) {
    peerConnection.close();
  }

  document.querySelector("#shareBtn").disabled = false;
  document.querySelector("#currentRoom").innerText = "";

  // Delete room on hangup
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

  document.location.href = document.location.origin;
}

async function createRoom() {
  document.querySelector("#shareBtn").disabled = true;
  // document.querySelector("#joinBtn").disabled = true;
  const db = firebase.firestore();
  const roomId = genId(7);
  const roomRef = await db.collection("rooms").doc(roomId);

  const callerCandidatesCollection = roomRef.collection("callerCandidates");
  peerConnection = createPeerConnection(callerCandidatesCollection);
  peerConnection.createDataChannel("file");
  registerPeerConnectionListeners();

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  console.log("Created offer:", offer);
  const roomWithOffer = {
    offer: {
      type: offer.type,
      sdp: offer.sdp,
    },
  };
  await roomRef.set(roomWithOffer);
  console.log(`New room created with SDP offer. Room ID: ${roomId}`);
  document.querySelector(
    "#currentRoom"
  ).innerText = `Your File Share is ready at ${window.location.origin}/#${roomId}`;

  roomRef.onSnapshot(async (snapshot) => {
    const data = snapshot.data();
    if (!peerConnection.currentRemoteDescription && data && data.answer) {
      console.log("Got remote description: ", data.answer);
      const rtcSessionDescription = new RTCSessionDescription(data.answer);
      await peerConnection.setRemoteDescription(rtcSessionDescription);
    }
  });

  roomRef.collection("calleeCandidates").onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === "added") {
        let data = change.doc.data();
        console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
        await peerConnection.addIceCandidate(new RTCIceCandidate(data));
        sendFile();
      }
    });
  });
}

function joinRoom() {
  document.querySelector("#shareBtn").disabled = true;
  // document.querySelector("#joinBtn").disabled = true;

  document.querySelector("#confirmJoinBtn").addEventListener(
    "click",
    async () => {
      roomId = document.querySelector("#room-id").value;
      console.log("Join room: ", roomId);
      document.querySelector(
        "#currentRoom"
      ).innerText = `Current room is ${roomId} - You are the callee!`;
      await joinRoomById(roomId);
    },
    { once: true }
  );
  roomDialog.open();
}

async function joinRoomById(roomId) {
  const db = firebase.firestore();
  const roomRef = db.collection("rooms").doc(`${roomId}`);
  const roomSnapshot = await roomRef.get();
  console.log("Got room:", roomSnapshot.exists);

  if (roomSnapshot.exists) {
    console.log("Create PeerConnection with configuration: ", configuration);
    const calleeCandidatesCollection = roomRef.collection("calleeCandidates");
    peerConnection = createPeerConnection(calleeCandidatesCollection);
    registerPeerConnectionListeners();

    const offer = roomSnapshot.data().offer;
    console.log("Got offer:", offer);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    console.log("Created answer:", answer);
    await peerConnection.setLocalDescription(answer);

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
          await peerConnection.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
  }
}

init();
