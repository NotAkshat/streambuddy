import { useEffect, useState, useRef } from "react";
import VideoPreview from "../components/VideoPreview";
import Controls from "../components/Controls";
import { socket } from "../services/socket";
import useWebRTC from "../hooks/useWebRTC";

export default function StreamRoom({ role }) {
  const [stream, setStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [isCameraOn, setCameraOn] = useState(true);
  const [isMicOn, setMicOn] = useState(true);
  const [isSharing, setIsSharing] = useState(false);

  // Ref so socket callbacks always read the live stream value
  const streamRef = useRef(null);

  const {
    createConnection,
    createOffer,
    handleOffer,
    handleAnswer,
    handleCandidate,
    peerConnections,
  } = useWebRTC(streamRef, role, setRemoteStreams);

  // Start camera on mount
  useEffect(() => {
    startCamera();
  }, []);

  // Join room ONLY after stream exists
  useEffect(() => {
    if (!stream) return;
    socket.emit("join-room", { role });
  }, [stream]);

  // Host receives guest request
  useEffect(() => {
    socket.on("guest-waiting", (guestId) => {
      const approved = confirm("Guest wants to join. Approve?");
      if (approved) {
        socket.emit("approve-guest", guestId);
      }
    });

    return () => socket.off("guest-waiting");
  }, []);

  // Guest receives approval — reads streamRef.current, never stale
  useEffect(() => {
    socket.on("guest-approved", async ({ hostId }) => {
      if (!streamRef.current) return;

      createConnection(hostId);

      if (role === "guest") {
        await createOffer(hostId);
      }
    });

    return () => socket.off("guest-approved");
  }, []); // no stream dependency needed — ref is always current

  // WebRTC signaling
  useEffect(() => {
    socket.on("offer", ({ offer, from }) => {
      handleOffer(offer, from);
    });

    socket.on("answer", ({ answer, from }) => {
      handleAnswer(answer, from);
    });

    socket.on("candidate", ({ candidate, from }) => {
      handleCandidate(candidate, from);
    });

    return () => {
      socket.off("offer");
      socket.off("answer");
      socket.off("candidate");
    };
  }, []);

  async function startCamera() {
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      // Keep ref in sync so callbacks always have the live stream
      streamRef.current = media;
      setStream(media);
    } catch (err) {
      console.error("Camera access failed:", err);
    }
  }

  async function shareScreen() {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });

      const screenTrack = screenStream.getVideoTracks()[0];

      // Replace video track in ALL peer connections
      Object.values(peerConnections.current).forEach((pc) => {
        const sender = pc
          .getSenders()
          .find((s) => s.track && s.track.kind === "video");

        if (sender) sender.replaceTrack(screenTrack);
      });

      setIsSharing(true);

      // Revert to camera when screen share ends
      screenTrack.onended = () => {
        const cameraTrack = streamRef.current?.getVideoTracks()[0];

        Object.values(peerConnections.current).forEach((pc) => {
          const sender = pc
            .getSenders()
            .find((s) => s.track && s.track.kind === "video");

          if (sender && cameraTrack) sender.replaceTrack(cameraTrack);
        });

        setIsSharing(false);
      };
    } catch (err) {
      console.error("Screen share failed:", err);
    }
  }

  function toggleCamera() {
    streamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setCameraOn((prev) => !prev);
  }

  function toggleMic() {
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setMicOn((prev) => !prev);
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-black text-white">
      <h2 className="text-2xl mb-6">
        {role === "host" ? "Host View" : "Guest View"}
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stream && <VideoPreview stream={stream} />}

        {remoteStreams.map((s, index) => (
          <VideoPreview key={index} stream={s} />
        ))}
      </div>

      <Controls
        toggleCamera={toggleCamera}
        toggleMic={toggleMic}
        shareScreen={shareScreen}
        isCameraOn={isCameraOn}
        isMicOn={isMicOn}
        isSharing={isSharing}
      />
    </div>
  );
}