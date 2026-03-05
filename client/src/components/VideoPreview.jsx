import { useEffect, useRef } from "react";

export default function VideoPreview({ stream }) {

  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      className="rounded-2xl shadow-lg border border-gray-700 w-[500px]"
    />
  );
}