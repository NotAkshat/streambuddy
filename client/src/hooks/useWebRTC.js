import { useRef } from "react";
import { socket } from "../services/socket";

const servers = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export default function useWebRTC(localStreamRef, role, setRemoteStreams) {
  const peerConnections = useRef({});
  const candidateQueue = useRef({});
  // Track whether local description has been set for each peer
  const localDescSet = useRef({});

  function createConnection(socketId) {
    if (peerConnections.current[socketId]) return;

    const localStream = localStreamRef.current;
    if (!localStream) {
      console.log("Stream not ready");
      return;
    }

    const pc = new RTCPeerConnection(servers);
    peerConnections.current[socketId] = pc;
    candidateQueue.current[socketId] = [];
    localDescSet.current[socketId] = false;

    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    pc.ontrack = (event) => {
      const incomingStream = event.streams[0];
      setRemoteStreams((prev) => {
        const exists = prev.find((s) => s.id === incomingStream.id);
        if (exists) return prev;
        return [...prev, incomingStream];
      });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("candidate", {
          candidate: event.candidate,
          target: socketId,
        });
      }
    };

    // Log connection state changes for debugging
    pc.onconnectionstatechange = () => {
      console.log(`Connection [${socketId}] state:`, pc.connectionState);
    };

    pc.onicegatheringstatechange = () => {
      console.log(`ICE gathering [${socketId}]:`, pc.iceGatheringState);
    };
  }

  async function createOffer(socketId) {
    const pc = peerConnections.current[socketId];
    if (!pc) return;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Mark local description as set so queued candidates can be flushed
    localDescSet.current[socketId] = true;

    socket.emit("offer", { offer, target: socketId });
  }

  async function handleOffer(offer, from) {
    if (!peerConnections.current[from]) {
      createConnection(from);
    }

    const pc = peerConnections.current[from];
    if (!pc) return;

    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // Both descriptions now set — mark ready and flush queue
    localDescSet.current[from] = true;
    await flushCandidateQueue(from);

    socket.emit("answer", { answer, target: from });
  }

  async function handleAnswer(answer, from) {
    const pc = peerConnections.current[from];
    if (!pc) return;

    await pc.setRemoteDescription(new RTCSessionDescription(answer));

    // Remote description now set — flush queue
    await flushCandidateQueue(from);
  }

  async function handleCandidate(candidate, from) {
    const pc = peerConnections.current[from];

    // Queue if: no connection yet, no local desc, or no remote desc
    const shouldQueue =
      !pc ||
      !localDescSet.current[from] ||
      !pc.remoteDescription;

    if (shouldQueue) {
      if (!candidateQueue.current[from]) {
        candidateQueue.current[from] = [];
      }
      candidateQueue.current[from].push(candidate);
      return;
    }

    // Safe to add immediately
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error("ICE candidate error:", err);
    }
  }

  async function flushCandidateQueue(socketId) {
    const pc = peerConnections.current[socketId];
    const queue = candidateQueue.current[socketId];

    if (!pc || !queue || queue.length === 0) return;

    // Only flush when BOTH local and remote descriptions are set
    if (!localDescSet.current[socketId] || !pc.remoteDescription) return;

    candidateQueue.current[socketId] = [];

    for (const c of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (err) {
        console.error("ICE flush error:", err);
      }
    }
  }

  return {
    createConnection,
    createOffer,
    handleOffer,
    handleAnswer,
    handleCandidate,
    peerConnections,
  };
}