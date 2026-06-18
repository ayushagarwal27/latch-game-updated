import { io } from "socket.io-client";

// Single shared Socket.io connection for the whole game. Every scene imports
// this same instance so we never open duplicate connections when switching
// scenes.
//
// Backend URL is hard-coded here. `import.meta.env.DEV` is a built-in Vite
// flag (not an env file): it's true during `npm run dev` and false in a
// production build, so local development hits the local server and the
// deployed build hits Render automatically.
const URL = import.meta.env.DEV
  ? "http://localhost:3001"
  : "https://latch-game-updated.onrender.com";

const socket = io(URL, { withCredentials: true });

export default socket;
