const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

const ROOM_ID = "streamRoom";

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", ({ role }) => {
    socket.join(ROOM_ID);
    socket.role = role;
    console.log(role, "joined:", socket.id);

    if (role === "guest") {
      // Notify everyone else (the host) that a guest is waiting
      socket.to(ROOM_ID).emit("guest-waiting", socket.id);
    }
  });

  // Host approves guest — tell the guest who the host is
  socket.on("approve-guest", (guestId) => {
    io.to(guestId).emit("guest-approved", {
      hostId: socket.id,
    });
  });

  // -------- WEBRTC SIGNALING --------
  // Forward to the specific target peer only, and always include `from`
  // so the receiver knows who sent it.

  socket.on("offer", ({ offer, target }) => {
    io.to(target).emit("offer", {
      offer,
      from: socket.id,
    });
  });

  socket.on("answer", ({ answer, target }) => {
    io.to(target).emit("answer", {
      answer,
      from: socket.id,
    });
  });

  socket.on("candidate", ({ candidate, target }) => {
    io.to(target).emit("candidate", {
      candidate,
      from: socket.id,
    });
  });
  // ----------------------------------

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    // Notify remaining peers so they can clean up the connection
    socket.to(ROOM_ID).emit("peer-disconnected", socket.id);
  });
});

server.listen(3000, () => {
  console.log("Server running on port 3000");
});