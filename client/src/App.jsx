import { useState } from "react";
import RoleSelector from "./components/RoleSelector";
import StreamRoom from "./pages/StreamRoom";

export default function App() {

  const [role, setRole] = useState(null);

  if (!role) {
    return <RoleSelector onSelect={setRole} />;
  }

  return <StreamRoom role={role} />;
}