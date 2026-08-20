import argon2 from 'argon2';

const minimumPasswordLength = 14;

export const assertPasswordPolicy = (password: string): void => {
  if (password.length < minimumPasswordLength) {
    throw new Error(`Password must be at least ${minimumPasswordLength} characters long`);
  }
};

export const hashPassword = async (password: string): Promise<string> => {
  assertPasswordPolicy(password);

  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19 * 1024,
    timeCost: 2,
    parallelism: 1,
  });
};

export const verifyPassword = async (
  passwordHash: string,
  password: string,
): Promise<boolean> => {
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
};
