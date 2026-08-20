import bcrypt from "bcrypt";
import { Repository } from "typeorm";
import { User, UserRole } from "../entities/User";

export async function seedInitialAdmin(userRepo: Repository<User>): Promise<void> {
  const username = process.env.INIT_ADMIN_USERNAME;
  const password = process.env.INIT_ADMIN_PASSWORD;
  const name = process.env.INIT_ADMIN_NAME || "System Admin";

  if (!username || !password) {
    return;
  }

  const existing = await userRepo.findOne({ where: { username } });
  if (existing) {
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = userRepo.create({
    name,
    username,
    password: hashedPassword,
    role: UserRole.ADMIN,
    token: null
  });

  await userRepo.save(user);
}
