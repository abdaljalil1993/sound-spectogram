import "dotenv/config";
import "reflect-metadata";
import { createServer } from "http";
import { Server } from "socket.io";
import { AppDataSource } from "./config/data-source";
import { User } from "./entities/User";
import { registerDeviceSocket } from "./sockets/device.socket";
import { createApp } from "./app";
import { seedInitialAdmin } from "./utils/seed-admin";

async function bootstrap(): Promise<void> {
  await AppDataSource.initialize();

  const userRepo = AppDataSource.getRepository(User);
  await seedInitialAdmin(userRepo);

  const app = createApp();
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    maxHttpBufferSize: 1e8,
    perMessageDeflate: {
    threshold: 1024 // فعّل الضغط بس للرسائل الأكبر من 1KB
  },
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  registerDeviceSocket(io);

  const port = Number(process.env.PORT || 3111);
  httpServer.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
