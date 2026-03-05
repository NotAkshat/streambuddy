export default function Controls({
  toggleCamera,
  toggleMic,
  shareScreen,
  isCameraOn,
  isMicOn,
  isSharing
}) {

  return (

    <div className="flex gap-4 mt-6">

      <button onClick={toggleCamera}>
        {isCameraOn ? "📷 Camera Off" : "📷 Camera On"}
      </button>

      <button onClick={toggleMic}>
        {isMicOn ? "🎙️ Mute" : "🔇 Unmute"}
      </button>

      <button onClick={shareScreen}>
        {isSharing ? "🛑 Stop Share" : "🖥 Share Screen"}
      </button>

    </div>

  );

}