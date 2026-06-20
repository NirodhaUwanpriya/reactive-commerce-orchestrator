import { Request, Response } from 'express';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { db } from '../../shared/database/pool';

export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, first_name, last_name } = req.body;

    // 1. Basic validation
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    // 2. Check if the user already exists
    const userCheck = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      res.status(409).json({ error: 'A user with this email already exists.' });
      return;
    }

    // 3. Hash the password securely using Argon2
    const passwordHash = await argon2.hash(password);

    // 4. Insert the user into the database
    const insertQuery = `
      INSERT INTO users (email, password_hash, first_name, last_name)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, first_name, last_name, role, created_at;
    `;
    
    const result = await db.query(insertQuery, [email, passwordHash, first_name, last_name]);
    const newUser = result.rows[0];

    // 5. Respond with the created user object (excluding the password hash!)
    res.status(201).json({
      message: 'User registered successfully',
      user: newUser
    });
  } catch (error) {
    console.error('💥 Registration error:', error);
    res.status(500).json({ error: 'Internal server error occurred.' });
  }
};

export const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // 1. Basic Validation
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    // 2. Fetch the user from the database
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      // Security Tip: Use a generic message so attackers don't know if the email exists
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const user = result.rows[0];

    // 3. Verify the password against the stored Argon2 hash
    const isPasswordValid = await argon2.verify(user.password_hash, password);
    if (!isPasswordValid) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    // 4. Generate a JWT Token
    const secret = process.env.JWT_SECRET || 'fallback_secret';
    const token = jwt.sign(
      { userId: user.id, role: user.role }, // Payload data encoded inside the token
      secret,
      { expiresIn: '1h' } // Token expires automatically in 1 hour
    );

    // 5. Send back the token along with safe user info
    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('💥 Login error:', error);
    res.status(500).json({ error: 'Internal server error occurred.' });
  }
};