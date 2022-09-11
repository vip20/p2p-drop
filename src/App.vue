<script setup lang="ts">
import { onMounted, ref } from "vue";
import DropZoneVue from "./components/DropZone.vue";
import { db } from "@/firebase";
import SimplePeer from "simple-peer";
import { PeerFileSend, PeerFileReceive } from "simple-peer-files";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";
import { $listeners } from "ee-ts";
const user = {
  r: {
    isSender: false,
    title: "Downloading!",
    abbr: "Receiver",
  },
  s: {
    isSender: true,
    title: "Upload!",
    abbr: "Sender",
  },
};
const cUser = ref();
const roomId = ref();
const file = ref<File>();
const pfs = ref<PeerFileSend>();
const pfr = ref<PeerFileReceive>();
const fileMeta = ref();
const progressPc = ref();
const roomUrl = ref();
const downloadTxtCnt = ref<string>();
const bitRate = ref(0);
const bitRateMax = ref(0);
const progressHeaderStyle = ref({
  "--progress-width": "0%",
});
let bytesPrev = 0,
  bytesNow = 0,
  timestampPrev = 0,
  timestampNow = 0;

let senderPeer: SimplePeer.Instance;
let receiverPeer: SimplePeer.Instance;
function genId(size: number): string {
  var result = "";
  var characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var charactersLength = characters.length;
  for (var i = 0; i < size; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}
onMounted(() => {
  const hash = window.location.hash;
  if (hash) {
    cUser.value = user.r;
    roomId.value = hash.slice(1);
    joinRoom();
  } else {
    cUser.value = user.s;
  }
});

function fileDropped(e: File) {
  file.value = e;
  createRoom();
}

function copyText() {
  const copiedSuccess = document.getElementById("copied-success");
  navigator.clipboard.writeText(roomUrl.value);
  copiedSuccess?.classList.toggle("fade");
  setTimeout(() => {
    copiedSuccess?.classList.toggle("fade");
  }, 2000);
}

async function createRoom() {
  if (file.value) {
    roomId.value = genId(7);
    roomUrl.value = `${window.location.origin}/#${roomId.value}`;
    const roomRef = await doc(collection(db, "rooms"), roomId.value);
    console.log(roomId.value);
    // const callerCandidatesCollection = collection(roomRef, "callerCandidates");
    senderPeer = new SimplePeer({
      initiator: true,
      trickle: false,
      channelName: `fileTransfer_${roomId.value}`,
    });
    senderPeer.on("signal", function (data) {
      setDoc(roomRef, { offer: data });
    });
    onSnapshot(roomRef, (snapshot) => {
      const data = snapshot.data();
      if (data?.answer) {
        senderPeer.signal(data.answer);
      }
    });
    senderPeer.on("connect", () => {
      timestampPrev = new Date().getTime();
      let bytesSent = 0;
      setInterval(() => {
        stats(bytesSent);
      }, 500);
      pfs.value = new PeerFileSend(senderPeer, file.value as File);
      pfs.value.start();
      pfs.value[$listeners].progress;
      pfs.value.on("progress", (percent, bs) => {
        fileMeta.value = {
          name: file.value?.name,
          size: file.value?.size,
          type: file.value?.type,
        };
        bytesSent = bs;
        progressPc.value = parseFloat(percent.toFixed(2));
        progressHeaderStyle.value = {
          "--progress-width": percent + "%",
        };
      });
    });
  }
}
async function joinRoom() {
  const roomRef = await doc(collection(db, "rooms"), roomId.value);
  const roomSnapShot = await getDoc(roomRef);
  if (roomSnapShot.exists()) {
    receiverPeer = new SimplePeer({
      trickle: false,
      channelName: `fileTransfer_${roomId.value}`,
    });
    receiverPeer.on("signal", function (data) {
      setDoc(roomRef, { answer: data }, { merge: true });
    });
    receiverPeer.signal(roomSnapShot.data().offer);
    receiverPeer.on("connect", () => {
      pfr.value = new PeerFileReceive(receiverPeer);

      timestampPrev = new Date().getTime();
      setInterval(() => {
        stats(pfr.value?.bytesReceived);
      }, 500);
      pfr.value.on("progress", (percent) => {
        fileMeta.value = {
          name: pfr.value?.fileName,
          size: pfr.value?.fileSize,
          type: pfr.value?.fileType,
        };
        progressPc.value = parseFloat(percent.toFixed(2));
        progressHeaderStyle.value = {
          "--progress-width": percent + "%",
        };
      });
      pfr.value.on("done", (f: File) => {
        file.value = f;
        downloadTxtCnt.value = `Click to download '${f.name}' (${readableBytes(
          f.size
        )})`;
      });
      // new PeerFileSend()
      receiverPeer.send("sendFile");
    });
  }
}

function stats(bytes: number | undefined) {
  if (bytes) {
    bytesNow = bytes;
    timestampNow = new Date().getTime();
    bitRate.value = Math.round(
      ((bytesNow - bytesPrev) * 8) / (timestampNow - timestampPrev)
    );
    bytesPrev = bytesNow;
    timestampPrev = timestampNow;
    if (bitRate.value > bitRateMax.value) {
      bitRateMax.value = bitRate.value;
    }
  }
}

// async function displayStats(peerConnection: SimplePeer.Instance) {
//   if (peerConnection && peerConnection.iceConnectionState === "connected") {
//     const stats = await peerConnection.getStats();
//     let activeCandidatePair;
//     stats.forEach((report: any) => {
//       if (report.type === "transport") {
//         activeCandidatePair = stats.get(report.selectedCandidatePairId);
//       }
//     });
//     if (activeCandidatePair) {
//       if (timestampPrev === activeCandidatePair.timestamp) {
//         return;
//       }
//       // calculate current bitrate
//       const bytesNow = activeCandidatePair.bytesReceived;
//       const bitrate = Math.round(
//         ((bytesNow - bytesPrev) * 8) /
//           (activeCandidatePair.timestamp - timestampPrev)
//       );
//       bitrateDiv.innerHTML = `<strong>Current Bitrate:</strong> ${bitrate} kbits/sec`;
//       timestampPrev = activeCandidatePair.timestamp;
//       bytesPrev = bytesNow;
//       if (bitrate > bitrateMax) {
//         bitrateMax = bitrate;
//       }
//     }
//   }
// }
function fileDownload() {
  if (file.value) {
    const url = window.URL.createObjectURL(file.value);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", file.value.name);
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
    }, 10);
  }
}

function readableBytes(x: any) {
  const units = ["bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  let l = 0,
    n = parseInt(x, 10) || 0;
  while (n >= 1024 && ++l) {
    n = n / 1024;
  }
  return n.toFixed(n < 10 && l > 0 ? 1 : 0) + " " + units[l];
}
</script>

<template>
  <div class="container">
    <header class="header">
      <div class="header__logo">
        <div class="logo">P2P Drop!</div>
      </div>
    </header>
    <div class="content">
      <div class="index-content framed">
        <h1 id="hello-there">Hello there!</h1>
        <p>
          I am <code>P2P Drop</code>, here to help you share files with your
          family and friends with no middle man and server involed. I use
          <code>WebRTC</code> at my core.
        </p>
      </div>
      <div class="posts">
        <div class="post on-list">
          <h1 class="post-title" id="post-title">{{ cUser?.title }}</h1>
          <div class="post-meta" id="progress-container" v-if="progressPc">
            <div class="header">
              <div id="filedetails" v-if="fileMeta">{{ fileMeta.name }}</div>
              <div
                class="header__logo progress_header"
                :style="progressHeaderStyle"
              >
                <div class="logo" id="progress-percentage">
                  {{ progressPc }}%
                </div>
              </div>
              <div id="bitrate" v-if="bitRate">
                <strong>Current Bitrate:</strong> {{ bitRate }} kbits/sec
              </div>
              <div class="code">
                <a id="download" @click="fileDownload">{{ downloadTxtCnt }}</a>
              </div>
            </div>
          </div>
          <div id="current-room" v-if="roomUrl && !progressPc">
            <span id="currentRoom"
              >Your File is ready to be shared at
              <div class="clipboard">
                <input
                  @click="copyText"
                  class="copy-input"
                  :value="roomUrl"
                  id="copyClipboard"
                  readonly
                />
                <button class="copy-btn" id="copyButton" @click="copyText">
                  <i class="far fa-copy"></i>
                </button></div
            ></span>
          </div>

          <div id="copied-success" class="copied fade">
            <span>Copied!</span>
          </div>

          <div
            class="post-cover droparea"
            id="file-picker-container"
            v-if="cUser?.isSender && !progressPc && !roomUrl"
          >
            <DropZoneVue @files-dropped="fileDropped">
              Drag and drop file or click here
            </DropZoneVue>
          </div>

          <div class="post-content">
            <p>
              The url generated is single time use only. A single file can be
              shared to a single person after the URL has been generated.
            </p>
            <p>
              I am too young and might be glitchy at times. Please inform my
              <code><a href="http://vinayp.com">developer</a></code
              >, so he can fix me.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
