import { io } from "socket.io-client";

// Single shared Socket.io connection for the whole game. Every scene imports
// this same instance so we never open duplicate connections when switching
// scenes. Point it at a different backend with a VITE_SERVER_URL env var.
const URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_SERVER_URL) ||
  "http://localhost:3001";

const socket = io(URL, { withCredentials: true });

export default socket;
