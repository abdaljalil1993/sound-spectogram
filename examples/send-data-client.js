const { io } = require("socket.io-client");

const socket = io("http://localhost:3000");

socket.on("connect", () => {
  console.log("Connected as", socket.id);

  socket.emit(
    "send_data",
    {
      deviceId: 1,
      timestamp: new Date().toISOString(),
      data: [
        [0.12, 0.18, 0.24, 0.31],
        [0.42, 0.37, 0.29, 0.21],
        [0.55, 0.61, 0.68, 0.74]
      ]
    },
    (response) => {
      console.log("Ack:", response);
    }
  );
});

socket.on("device:data", (payload) => {
  console.log("Broadcast from server:", payload);
});

socket.on("disconnect", (reason) => {
  console.log("Disconnected:", reason);
});
