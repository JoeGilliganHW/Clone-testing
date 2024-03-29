import './style.css';
import { initializeApp } from 'firebase/app';
import {getFirestore, collection, doc, getDoc, setDoc, addDoc, onSnapshot, updateDoc} from 'firebase/firestore';
import {getDatabase, ref, set, onChildAdded} from 'firebase/database';


// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBhSE2SUPyU64wQYh_K9d0-ZPHVdSC-JpE",
  authDomain: "conference-call-c089e.firebaseapp.com",
  databaseURL: "https://conference-call-c089e-default-rtdb.europe-west1.firebasedatabase.app/",
  projectId: "conference-call-c089e",
  storageBucket: "conference-call-c089e.appspot.com",
  messagingSenderId: "1046185829013",
  appId: "1:1046185829013:web:3c35917f945d12e8ee719c"

};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const database = getDatabase(app);

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

let pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML Buttons
const webcamButton = document.getElementById('webcamButton');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const hangupButton = document.getElementById('hangupButton');
const muteButton = document.getElementById('muteButton');

// HTML Video Section
const videoContainer = document.getElementById('videos')
const remoteVideo = document.getElementById('remoteVideo');
const webcamVideo = document.getElementById('webcamVideo');

hangupButton.disabled = true;
answerButton.disabled = true;
callButton.disabled = true;
muteButton.disabled = true;

function createVideoElement(stream) {
  const newVideo = document.createElement('video');
  newVideo.autoplay = true;
  newVideo.srcObject = stream;
  videoContainer.appendChild(newVideo);
}
//This section is for the live chat
//The first function is to send messages and the second part is to 
document.getElementById("send-message").addEventListener("submit", postChat);
function postChat(e) {
  e.preventDefault();
  const timestamp = Date.now();
  const chatTxt = document.getElementById("chat-txt");
  const message = chatTxt.value;
  chatTxt.value = "";
  const messageRef = ref(database, 'messages/' + timestamp);
  set(messageRef, {
    msg: message
  });
}

const fetchChat = ref(database, 'messages');
onChildAdded(fetchChat, (snapshot) => {
  const messages = snapshot.val();
  const msg = "<li>" + "Username: " + messages.msg + "</li>";
  document.getElementById("messages").innerHTML += msg;
});

webcamButton.onclick = async () => {
  alert("You are starting your webcam");
  //attempts to get access to users media devices (webcam and microphone)
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
  muteButton.disabled = false;
};

callButton.onclick = async () => {
  alert("You are creating a conference room, share the code with other users you want in the room");
    console.log("1");
    //This is a collection in the firebase server it contains many documents
    const callsCollection = collection(db, 'calls');

    //This is a reference to the collection
    const callsDocRef = doc(callsCollection);

    const offerCandidates = collection(callsDocRef, 'offerCandidates');
    const answerCandidates = collection(callsDocRef, 'answerCandidates');
  
    callInput.value = callsDocRef.id;

    console.log("2");
    // Get candidates for caller, save to db
    pc.onicecandidate = event => {
      event.candidate && addDoc(offerCandidates, event.candidate.toJSON());
    };
    console.log("3");
    // Create offer
    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);
    console.log("4");
    const offer = {
      sdp: offerDescription.sdp,
      type: offerDescription.type,
    };
    console.log("5");
    await setDoc(callsDocRef, { offer });
    console.log("6");
    // Listen for remote answer from database, when recieved we update that answer on out peer connection
    onSnapshot(callsDocRef, (snapshot) => {
      const data = snapshot.data();
      //if the peer doesnt have a remote description and the data doesnt have an answer then create an answer description
      if (!pc.currentRemoteDescription && data?.answer) {
        const answerDescription = new RTCSessionDescription(data.answer);
        pc.setRemoteDescription(answerDescription);
      }
    });
    console.log("7");
    // Listen for remote ICE candidates, when answered adds more people to peer connection
    onSnapshot(answerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate);
        }
      });
    });
    hangupButton.disabled = false;
    muteButton.disabled = false;
  }

  answerButton.onclick = async () => {
    alert("You are joining a call");
    //This is the code for the room
    const callId = callInput.value;
    //this looks for the code in the server
    const callDoc = doc(collection(db, 'calls'), callId);
    //This gets the lists of of offer candidates
    const offerCandidates = collection(callDoc, 'offerCandidates');
    //This gets the lists of of answer candidates
    const answerCandidates = collection(callDoc, 'answerCandidates');
  
    pc.onicecandidate = event => {
      event.candidate && addDoc(answerCandidates, event.candidate.toJSON());
    };
  
    // Fetch data, then set the offer & answer
  
    const callData = (await getDoc(callDoc)).data();
  
    const offerDescription = callData.offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));
  
    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);
  
    const answer = {
      type: answerDescription.type,
      sdp: answerDescription.sdp,
    };
  
    await updateDoc(callDoc, { answer });
  
    // Listen to offer candidates
  
    onSnapshot(offerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        console.log(change)
        if (change.type === 'added') {
          let data = change.doc.data();
          pc.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
    hangupButton.disabled = false;
    muteButton.disabled = false;
  };

  hangupButton.onclick = async () => {
    alert("You are leaving this call");
    // Close the peer connection
    if (pc) {
      pc.close();
      pc = null; // Reset the peer connection
    }

    // Stop local stream and clear remote stream
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        track.stop(); // Stop tracks
      });
      localStream = null; // Reset local stream
    }

    if (remoteStream) {
      remoteStream.getTracks().forEach((track) => {
        track.stop(); // Stop tracks
      });
      remoteStream = null; // Reset remote stream
    }

    // Disable buttons and reset UI as needed
    callButton.disabled = false;
    answerButton.disabled = false;
    webcamButton.disabled = false;
    muteButton.disabled = true;
  };

  muteButton.onclick = async () => {
    // Toggle mute state
    const isMuted = localStream.getAudioTracks()[0].enabled;
    
    // Toggle audio tracks state
    localStream.getAudioTracks().forEach(track => {
      track.enabled = !isMuted;
    });
    
    // Update UI based on mute state
    if (isMuted) {
      alert("You are now muted");
      // Change button text or icon to indicate unmuted state
      muteButton.value = "Mute";
      
    } else {
      alert("You are now unmuted");
      // Change button text or icon to indicate muted state
      muteButton.value = "Unmute";
      
    }
  };