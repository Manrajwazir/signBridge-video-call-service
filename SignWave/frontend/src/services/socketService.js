import {io} from "socket.io-client";

const SERVER = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";
const socket = io(SERVER, { transports: ["websocket"] });

export default {
  on(event, cb) { socket.on(event, cb); },
  emit(event, data) { socket.emit(event, data); },
  off(event, cb) { socket.off(event, cb); },
  id() { return socket.id; },
  socket
};