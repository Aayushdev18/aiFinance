import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { RegisterInput, LoginInput } from './auth.schemas.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

// In-memory tenant user registry for mock/testing when Postgres instance is disconnected
export const inMemoryUserStore = new Map<string, UserRecord>();

const JWT_SECRET = process.env.JWT_SECRET || 'finpilot-super-secret-jwt-key-min-32-chars';
const JWT_EXPIRES_SECONDS = 900; // 15 minutes
const REFRESH_EXPIRES_SECONDS = 604800; // 7 days

export class AuthService {
  /**
   * Hashes password with bcrypt using 12 salt rounds.
   */
  public static async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(password, salt);
  }

  /**
   * Verifies plaintext password against stored hash.
   */
  public static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Registers a new user with secure password hash and unique email verification.
   */
  public static async register(input: RegisterInput): Promise<{ user: Omit<UserRecord, 'passwordHash'>; tokens: AuthTokens }> {
    const existing = Array.from(inMemoryUserStore.values()).find(u => u.email === input.email);
    if (existing) {
      throw new Error('A user with this email address already exists');
    }

    const passwordHash = await this.hashPassword(input.password);
    const userId = 'usr_' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);

    const newUser: UserRecord = {
      id: userId,
      email: input.email,
      passwordHash,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    inMemoryUserStore.set(userId, newUser);

    const tokens = this.generateTokens(newUser);
    const { passwordHash: _, ...safeUser } = newUser;

    return { user: safeUser, tokens };
  }

  /**
   * Authenticates user credentials and issues signed JWT tokens.
   */
  public static async login(input: LoginInput): Promise<{ user: Omit<UserRecord, 'passwordHash'>; tokens: AuthTokens }> {
    const user = Array.from(inMemoryUserStore.values()).find(u => u.email === input.email);
    if (!user) {
      throw new Error('Invalid email or password credentials');
    }

    const isValid = await this.verifyPassword(input.password, user.passwordHash);
    if (!isValid) {
      throw new Error('Invalid email or password credentials');
    }

    const tokens = this.generateTokens(user);
    const { passwordHash: _, ...safeUser } = user;

    return { user: safeUser, tokens };
  }

  /**
   * Issues signed Access and Refresh JWT tokens with embedded tenant context.
   */
  public static generateTokens(user: Pick<UserRecord, 'id' | 'email'>): AuthTokens {
    const accessToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        type: 'access'
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_SECONDS }
    );

    const refreshToken = jwt.sign(
      {
        sub: user.id,
        type: 'refresh'
      },
      JWT_SECRET,
      { expiresIn: REFRESH_EXPIRES_SECONDS }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: JWT_EXPIRES_SECONDS
    };
  }

  /**
   * Validates and verifies JWT token signature.
   */
  public static verifyToken(token: string): { sub: string; email: string; type: string } {
    return jwt.verify(token, JWT_SECRET) as { sub: string; email: string; type: string };
  }
}
