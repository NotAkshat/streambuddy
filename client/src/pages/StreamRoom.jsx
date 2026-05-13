import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import VideoPreview from "../components/VideoPreview";
import Controls from "../components/Controls";
import { socket } from "../services/socket";
import { supabase } from "../services/supabase";
import { useAuth } from "../context/AuthContext";
import useWebRTC from "../hooks/useWebRTC";

export default function StreamRoom() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const role = searchParams.get("role") || "guest";
  const navigate = useNavigate();
  const { user } = useAuth();

  const [stream, setStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [isCameraOn, setCameraOn] = useState(true);
  const [isMicOn, setMicOn] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [roomInfo, setRoomInfo] = useState(null);

  const streamRef = useRef(null);
  const screenTrackRef = useRef(null);
  const isSharingRef = useRef(false);

  const {
    createConnection,
    createOffer,
    handleOffer,
    handleAnswer,
    handleCandidate,
    peerConnections,
  } = useWebRTC(streamRef, role, setRemoteStreams);

  // Load room info from Supabase
  useEffect(() => {
    async function loadRoom() {
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", roomId)
        .single();

      if (error || !data) {
        alert("Room not found");
        navigate("/lobby");
        return;
      }

      setRoomInfo(data);

      // Mark room as live
      if (role === "host") {
        await supabase
          .from("rooms")
          .update({ status: "live" })
          .eq("id", roomId);
      }
    }

    loadRoom();
  }, [roomId]);

  // Start camera on mount
  useEffect(() => {
    startCamera();

    return () => {
      // Cleanup on unmount
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Join socket room ONLY after stream exists
  useEffect(() => {
    if (!stream) return;
    socket.emit("join-room", { roomId, role, userId: user.id });
  }, [stream]);

  // Host receives guest request
  useEffect(() => {
    socket.on("guest-waiting", ({ guestId, userId }) => {
      const approved = confirm(`Guest wants to join. Approve?`);
      if (approved) socket.emit("approve-guest", { guestId, roomId });
    });

    return () => socket.off("guest-waiting");
  }, []);

  // Guest receives approval
  useEffect(() => {
    socket.on("guest-approved", async ({ hostId }) => {
      if (!streamRef.current) return;
      createConnection(hostId);
      if (role === "guest") await createOffer(hostId);
    });

    return () => socket.off("guest-approved");
  }, []);

  // WebRTC signaling
  useEffect(() => {
    socket.on("offer", ({ offer, from }) => handleOffer(offer, from));
    socket.on("answer", ({ answer, from }) => handleAnswer(answer, from));
    socket.on("candidate", ({ candidate, from }) => handleCandidate(candidate, from));

    socket.on("peer-disconnected", (peerId) => {
      setRemoteStreams((prev) =>
        prev.filter((_, i) => i !== Object.keys(peerConnections.current).indexOf(peerId))
      );
    });

    return () => {
      socket.off("offer");
      socket.off("answer");
      socket.off("candidate");
      socket.off("peer-disconnected");
    };
  }, []);

  async function startCamera() {
    try {
      const constraints = { video: { facingMode: "user" }, audio: true };
      const media = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = media;
      setStream(media);
      setCameraOn(true);
      setMicOn(true);
      return;
    } catch (err) {
      console.error("Camera access failed:", err);

      // Handle common errors with user-friendly messages and a fallback
      if (err.name === "NotAllowedError" || err.name === "SecurityError") {
        alert(
          "Camera/microphone permission denied. Please allow access in your browser and reload the page."
        );
        return;
      }

      if (err.name === "NotFoundError" || err.name === "OverconstrainedError") {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter((d) => d.kind === "videoinput");
          if (videoDevices.length === 0) {
            alert("No camera detected. Connect a camera and try again.");
            return;
          }

          // Try the first available camera by deviceId
          const media = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: videoDevices[0].deviceId } },
            audio: true,
          });
          streamRef.current = media;
          setStream(media);
          setCameraOn(true);
          setMicOn(true);
          return;
        } catch (err2) {
          console.error("Fallback camera attempt failed:", err2);
        }
      }

      alert(
        "Unable to access camera/microphone. Check permissions, reconnect devices, and ensure the page is served over HTTPS (or localhost). See console for details."
      );
    }
  }

  function revertToCamera() {
    const cameraTrack = streamRef.current?.getVideoTracks()[0];
    Object.values(peerConnections.current).forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender && cameraTrack) sender.replaceTrack(cameraTrack);
    });
    screenTrackRef.current = null;
    isSharingRef.current = false;
    setIsSharing(false);
  }

  async function shareScreen() {
    if (isSharingRef.current) {
      screenTrackRef.current?.stop();
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      screenTrackRef.current = screenTrack;

      Object.values(peerConnections.current).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) sender.replaceTrack(screenTrack);
      });

      isSharingRef.current = true;
      setIsSharing(true);

      screenTrack.onended = revertToCamera;
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

  async function leaveRoom() {
    streamRef.current?.getTracks().forEach((t) => t.stop());

    if (role === "host") {
      await supabase.from("rooms").update({ status: "ended" }).eq("id", roomId);
    }

    socket.emit("leave-room", { roomId });
    navigate("/lobby");
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-6">
      {/* Header */}
      <div className="w-full max-w-5xl flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold">{roomInfo?.name ?? "Loading..."}</h2>
          <p className="text-zinc-500 text-xs mt-1">
            {role === "host" ? "👑 Host" : "🎙 Guest"} · Room ID:{" "}
            <span
              className="text-indigo-400 cursor-pointer hover:underline"
              onClick={() => navigator.clipboard.writeText(roomId)}
              title="Click to copy"
            >
              {roomId}
            </span>
          </p>
        </div>
        <button
          onClick={leaveRoom}
          className="bg-red-600 hover:bg-red-700 text-sm px-4 py-2 rounded-lg transition"
        >
          {role === "host" ? "End Room" : "Leave"}
        </button>
      </div>

      {/* Video Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-5xl">
        {stream && <VideoPreview stream={stream} label="You" />}
        {remoteStreams.map((s, index) => (
          <VideoPreview key={index} stream={s} label={`Guest ${index + 1}`} />
        ))}
      </div>

      {/* Controls */}
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