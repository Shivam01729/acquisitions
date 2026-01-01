import logger from '#config/logger.js';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from '#config/database.js';
import { users } from '#models/user.model.js';

export const hashPassword = async password => {
  try {
    return await bcrypt.hash(password, 10);
  } catch (e) {
    logger.error(`Password hashing error: ${e}`);
    throw new Error('Password hashing failed');
  }
};

export const comparePassword = async (password, hashedPassword) => {
  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (e) {
    logger.error(`Password comparison error: ${e}`);
    throw new Error('Password comparison failed');
  }
};

export const createUser = async ({ name, email, password, role = 'user' }) => {
  try {
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      throw new Error('user already exists');
    }

    const password_hash = await hashPassword(password);

    const [newUser] = await db
      .insert(users)
      .values({ name, email, password: password_hash, role })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        created_at: users.createdAt,
      });

    logger.info(`New user created with id: ${newUser.id}, email: ${newUser.email}`);
    return newUser;
  } catch (e) {
    logger.error(`Create user error: ${e}`);
    throw e;
  }
};

export const authenticateUser = async ({ email, password }) => {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      logger.info(`Authentication failed: user not found for email ${email}`);
      throw new Error('invalid credentials');
    }

    const passwordMatches = await comparePassword(password, user.password);

    if (!passwordMatches) {
      logger.info(`Authentication failed: invalid password for email ${email}`);
      throw new Error('invalid credentials');
    }

    const { password: _password, ...safeUser } = user;
    logger.info(`User authenticated with id: ${safeUser.id}, email: ${safeUser.email}`);
    return safeUser;
  } catch (e) {
    if (e.message === 'invalid credentials') {
      // already logged as info above
      throw e;
    }

    logger.error(`Authenticate user error: ${e}`);
    throw e;
  }
};
