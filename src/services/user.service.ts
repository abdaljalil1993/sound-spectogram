import bcrypt from "bcrypt";
import { Repository } from "typeorm";
import { AppDataSource } from "../config/data-source";
import { User, UserRole } from "../entities/User";
import { HttpError } from "../utils/http-error";
import { signJwt } from "../utils/jwt";

interface CreateUserInput {
  name: string;
  username: string;
  password: string;
  role: UserRole;
}

interface UpdateUserInput {
  name?: string;
  username?: string;
  password?: string;
  role?: UserRole;
}

export class UserService {
  private readonly userRepo: Repository<User>;

  constructor() {
    this.userRepo = AppDataSource.getRepository(User);
  }

  private sanitizeUser(user: User): Omit<User, "password"> {
    const { password: _password, ...safeUser } = user;
    return safeUser;
  }

  async createUser(input: CreateUserInput): Promise<Omit<User, "password">> {
    const existing = await this.userRepo.findOne({ where: { username: input.username } });
    if (existing) {
      throw new HttpError(409, "Username already exists");
    }

    const hashedPassword = await bcrypt.hash(input.password, 10);
    const user = this.userRepo.create({
      name: input.name,
      username: input.username,
      password: hashedPassword,
      role: input.role,
      token: null
    });

    const saved = await this.userRepo.save(user);
    return this.sanitizeUser(saved);
  }

  async authenticateUser(username: string, password: string): Promise<{
    token: string;
    user: { id: number; name: string; username: string; role: UserRole };
  }> {
    const user = await this.userRepo.findOne({ where: { username } });
    if (!user) {
      throw new HttpError(401, "Invalid username or password");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new HttpError(401, "Invalid username or password");
    }

    const token = signJwt({
      userId: user.id,
      username: user.username,
      role: user.role
    });

    user.token = token;
    await this.userRepo.save(user);

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role
      }
    };
  }

  async getUsers(): Promise<Array<Omit<User, "password">>> {
    const users = await this.userRepo.find({ order: { id: "ASC" } });
    return users.map((user) => this.sanitizeUser(user));
  }

  async getUserById(id: number): Promise<Omit<User, "password">> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new HttpError(404, "User not found");
    }
    return this.sanitizeUser(user);
  }

  async updateUser(id: number, input: UpdateUserInput): Promise<Omit<User, "password">> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new HttpError(404, "User not found");
    }

    if (input.username && input.username !== user.username) {
      const existing = await this.userRepo.findOne({ where: { username: input.username } });
      if (existing) {
        throw new HttpError(409, "Username already exists");
      }
      user.username = input.username;
    }

    if (input.name) {
      user.name = input.name;
    }

    if (input.role) {
      user.role = input.role;
    }

    if (input.password) {
      user.password = await bcrypt.hash(input.password, 10);
    }

    const saved = await this.userRepo.save(user);
    return this.sanitizeUser(saved);
  }

  async deleteUser(id: number): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new HttpError(404, "User not found");
    }

    await this.userRepo.delete(id);
  }
}
