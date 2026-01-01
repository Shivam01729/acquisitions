import logger from '#config/logger.js';
import { createUser, authenticateUser } from '#services/auth.service.js';
import { signUpSchema, signInSchema } from '#validations/auth.validation.js';
import { formatValidator } from '#utils/format.js';
import { jwttoken } from '#utils/jwt.js';
import { cookies } from '#utils/cookies.js';

export const signup = async (req, res, next) => {
  try {
    const validationResult = signUpSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'validation failed',
        details: formatValidator(validationResult.error),
      });
    }

    const { name, email, password, role } = validationResult.data;

    const user = await createUser({ name, email, password, role });
    const token = jwttoken.sign({ id: user.id, email: user.email, role: user.role });

    cookies.set(res, 'token', token);

    logger.info(`User signed up with name: ${name}, email: ${email}, role: ${role}`);
    res.status(201).json({
      message: 'User signed up successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error('Signup error:', error);
    if (error.message === 'user already exists') {
      return res.status(409).json({ error: 'User already exists' });
    }
    next(error);
  }
};

export const signin = async (req, res, next) => {
  try {
    const validationResult = signInSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'validation failed',
        details: formatValidator(validationResult.error),
      });
    }

    const { email, password } = validationResult.data;

    const user = await authenticateUser({ email, password });
    const token = jwttoken.sign({ id: user.id, email: user.email, role: user.role });

    cookies.set(res, 'token', token);

    logger.info(`User signed in with email: ${email}, role: ${user.role}`);
    res.status(200).json({
      message: 'User signed in successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error('Signin error:', error);
    if (error.message === 'invalid credentials') {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    next(error);
  }
};

export const signout = async (req, res, next) => {
  try {
    cookies.clear(res, 'token');
    logger.info('User signed out');
    res.status(200).json({ message: 'User signed out successfully' });
  } catch (error) {
    logger.error('Signout error:', error);
    next(error);
  }
};
