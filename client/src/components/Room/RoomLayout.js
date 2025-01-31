import React, { useState, useEffect, useRef } from "react";
import BottomMenu from "./BottomMenu";
import io from "socket.io-client";
import Chat from "./chat/Chat";
import Meeting from "./meeting/Meeting";
import Peer from "peerjs";
import { useAppContext } from "../../context/store";
import {
  addVideo,
  deleteUser,
  replaceStream,
} from "../../actions/videoActions";
import { Notification } from "../MaterialComponents";
import { IconButton } from "@material-ui/core";
import { Close } from "@material-ui/icons";
import { addMessage } from "../../actions/messageActions";

function RoomLayout() {
  const [roomId, setRoomId] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [disconnectedUser, setDisconnectedUser] = useState("");
  const {
    state: { username, stream, videos },
    dispatch,
  } = useAppContext();
  const ref = useRef({
    socket: null,
    peer: null,
    userId: "",
    currVideos: new Set(),
    stream: stream,
  });

  useEffect(() => {
    ref.current.stream = stream;
  }, [stream]);

  useEffect(() => {
    addVideo({ id: -1, username, stream: ref.current.stream }, dispatch);
    setRoomId(getRoomId(window.location.pathname));

    ref.current.peer = new Peer(undefined, {
      host: "video-chat-server-virid.vercel.app",
      port: "443",
      secure: true,
    });

    ref.current.socket = io();

    const peer = ref.current.peer;
    const socket = ref.current.socket;

    socket.on("message", (username, body) => {
      const currTime = new Date();

      addMessage(
        {
          username,
          body,
          time: `${currTime.getHours()}:${currTime.getMinutes()}`,
        },
        dispatch
      );
    });

    socket.on("user-connected", (id, username) => {
      connectToNewUser(id, username, ref.current.stream, peer, socket);
    });

    socket.on("user-disconnected", (id, username) => {
      deleteUser(id, dispatch);
      ref.current.currVideos.delete(id);
      setDisconnectedUser(username);
      setNotificationOpen(true);
    });

    socket.on("stream-replaced", (id, username) => {
      replaceUserStream(id, username, ref.current.stream, peer, socket);
    });

    peer.on("call", (call) => {
      call.answer(ref.current.stream);
      call.on("stream", (recepientStream) => {
        socket.on("get-info", (srcId, destId, username, streamInfo) => {
          if (call.peer === srcId && ref.current.userId === destId) {
            if (streamInfo.video === "ended") {
              recepientStream.getVideoTracks()[0].stop();
            }

            if (!streamInfo.audio) {
              recepientStream.getAudioTracks()[0].enabled = false;
            }

            if (!ref.current.currVideos.has(srcId)) {
              addVideo(
                { id: srcId, username, stream: recepientStream },
                dispatch
              );
              ref.current.currVideos.add(srcId);
            }
          }
        });

        socket.emit("set-info", ref.current.userId, call.peer, username, {
          video: ref.current.stream.getVideoTracks()[0].readyState,
          audio: ref.current.stream.getAudioTracks()[0].enabled,
        });
      });
    });

    peer.on("open", (id) => {
      ref.current.userId = id;
      socket.emit(
        "join-room",
        getRoomId(window.location.pathname),
        id,
        username
      );
    });

    return () => {
      socket.disconnect();
      peer.destroy();
    };
  }, [username]);

  const connectToNewUser = (userId, name, stream, peer, socket) => {
    const call = peer.call(userId, stream);
    let info, recStream;

    socket.on("get-info", (srcId, destId, username, streamInfo) => {
      if (call.peer === srcId && ref.current.userId === destId) {
        info = streamInfo;

        if (recStream) {
          if (info.video === "ended") {
            recStream.getVideoTracks()[0].stop();
          }

          if (!info.audio) {
            recStream.getAudioTracks()[0].enabled = false;
          }

          if (!ref.current.currVideos.has(userId)) {
            addVideo(
              { id: userId, username: name, stream: recStream },
              dispatch
            );
            ref.current.currVideos.add(userId);
          }
        }
      }
    });

    call.on("stream", (recepientStream) => {
      recStream = recepientStream;

      if (info) {
        if (info.video === "ended") {
          recStream.getVideoTracks()[0].stop();
        }

        if (!info.audio) {
          recStream.getAudioTracks()[0].enabled = false;
        }

        if (!ref.current.currVideos.has(userId)) {
          addVideo({ id: userId, username: name, stream: recStream }, dispatch);
          ref.current.currVideos.add(userId);
        }
      }

      socket.emit("set-info", ref.current.userId, userId, username, {
        video: stream.getVideoTracks()[0].readyState,
        audio: stream.getAudioTracks()[0].enabled,
      });
    });
  };

  const replaceUserStream = (userId, name, stream, peer, socket) => {
    const call = peer.call(userId, stream);
    let info, recStream;

    socket.on("get-info", (srcId, destId, username, streamInfo) => {
      if (call.peer === srcId && ref.current.userId === destId) {
        info = streamInfo;

        if (recStream) {
          if (info.video === "ended") {
            recStream.getVideoTracks()[0].stop();
          }

          if (!info.audio) {
            recStream.getAudioTracks()[0].enabled = false;
          }

          replaceStream({ id: userId, stream: recStream }, dispatch);
          ref.current.currVideos.add(userId);
        }
      }
    });

    call.on("stream", (recepientStream) => {
      recStream = recepientStream;

      if (info) {
        if (info.video === "ended") {
          recStream.getVideoTracks()[0].stop();
        }

        if (!info.audio) {
          recStream.getAudioTracks()[0].enabled = false;
        }

        replaceStream({ id: userId, stream: recStream }, dispatch);
        ref.current.currVideos.add(userId);
      }

      socket.emit("set-info", ref.current.userId, userId, username, {
        video: stream.getVideoTracks()[0].readyState,
        audio: stream.getAudioTracks()[0].enabled,
      });
    });
  };

  const handleNotificationClose = (e, reason) => {
    if (reason === "clickaway") {
      return;
    }

    setNotificationOpen(false);
    setDisconnectedUser("");
  };

  const getRoomId = (path) => {
    return path.split("/")[2];
  };

  return (
    <>
      <Meeting
        socket={ref.current.socket}
        chatOpen={chatOpen}
        videos={videos}
        roomId={roomId}
        userId={ref.current.userId}
      />
      <BottomMenu
        socket={ref.current.socket}
        chatOpen={chatOpen}
        setChatOpen={setChatOpen}
        stream={ref.current.stream}
        userId={ref.current.userId}
        username={username}
        currVideos={ref.current.currVideos}
        dispatch={dispatch}
      />
      <Chat
        socket={ref.current.socket}
        open={chatOpen}
        setChatOpen={setChatOpen}
      />
      <Notification
        anchorOrigin={{
          vertical: "top",
          horizontal: "center",
        }}
        open={notificationOpen}
        message={`${disconnectedUser} left the meeting`}
        autoHideDuration={1000}
        onClose={handleNotificationClose}
        action={
          <>
            <IconButton onClick={handleNotificationClose}>
              <Close fontSize="small" style={{ color: "#64379f" }} />
            </IconButton>
          </>
        }
      />
    </>
  );
}

export default RoomLayout;
