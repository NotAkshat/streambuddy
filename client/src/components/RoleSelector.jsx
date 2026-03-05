export default function RoleSelector({ onSelect }) {
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-6 bg-black text-white">

      <h1 className="text-4xl font-bold">
        Live Streaming Platform
      </h1>

      <div className="flex gap-6">

        <button
          onClick={() => onSelect("host")}
          className="bg-red-600 px-6 py-3 rounded-xl hover:bg-red-700"
        >
          Join as Host
        </button>

        <button
          onClick={() => onSelect("guest")}
          className="bg-blue-600 px-6 py-3 rounded-xl hover:bg-blue-700"
        >
          Join as Guest
        </button>

      </div>

    </div>
  );
}