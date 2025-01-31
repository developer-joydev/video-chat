const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");
const { Server } = require("socket.io");
const { PeerServer } = require("peer");

const app = express();
const server = http.createServer(app);

// const ExpressPeerServer = require("peer").ExpressPeerServer;
// const peerServer = ExpressPeerServer(server, {
//   debug: true,
// });

const peerServer = PeerServer({ port: 443 });

const corsOptions = {
  origin: "*",
  methods: "GET,POST",
};

app.use("/peerjs", peerServer);

const io = new Server(server, {
  cors: corsOptions,
});

app.use(cors(corsOptions));

// Serve static assets if in production
if (process.env.NODE_ENV === "production") {
  // For Heroku redirection to secured layer connection in production
  app.use((req, res, next) => {
    if (req.header("x-forwarded-proto") !== "https") {
      res.redirect(`https://${req.header("host")}${req.url}`);
    } else {
      next();
    }
  });

  // Set static folder
  app.use(express.static("client/build"));

  app.get("*", (req, res) => {
    res.sendFile(path.resolve(__dirname, "client", "build", "index.html"));
  });
}

peerServer.on("connection", (socket) => {
  console.log("Connected");

  let currUserId, currUserName, currRoom;

  socket.on("join-room", (roomId, id, username) => {
    console.log(roomId, id, username);
    socket.join(roomId);
    socket.to(roomId).emit("user-connected", id, username);

    currUserId = id;
    currUserName = username;
    currRoom = roomId;

    socket.on("set-info", (srcId, destId, username, streamInfo) => {
      socket.to(roomId).emit("get-info", srcId, destId, username, streamInfo);
    });

    socket.on("set-audio", (userId, isAudio) => {
      io.to(roomId).emit("get-audio", userId, isAudio);
    });

    socket.on("set-video", (userId, isVideo) => {
      io.to(roomId).emit("get-video", userId, isVideo);
    });

    socket.on("replace-stream", (userId, username) => {
      socket.to(roomId).emit("stream-replaced", userId, username);
    });

    socket.on("message-sent", (username, message) => {
      socket.to(roomId).emit("message", username, message);
    });
  });

  socket.on("disconnect", () => {
    console.log("Disonnected");
    socket.to(currRoom).emit("user-disconnected", currUserId, currUserName);
  });
});

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => console.log(`Server started on port ${PORT}`));
