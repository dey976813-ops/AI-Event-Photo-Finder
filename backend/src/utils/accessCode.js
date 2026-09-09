const crypto = require("crypto");

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateSegment(length = 4) {
  let result = "";

  for (let i = 0; i < length; i++) {
    result += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  }

  return result;
}

function generateAccessCode() {
  return `MV-${generateSegment(4)}-${generateSegment(4)}`;
}

function hashAccessCode(accessCode) {
  const normalizedCode = accessCode.trim().toUpperCase();
  const salt = crypto.randomBytes(16);

  const derivedKey = crypto.scryptSync(
    normalizedCode,
    salt,
    64
  );

  return `scrypt$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

function verifyAccessCode(accessCode, storedHash) {
  if (!accessCode || !storedHash) {
    return false;
  }

  try {
    const normalizedCode = accessCode.trim().toUpperCase();

    const parts = storedHash.split("$");

    if (parts.length !== 3 || parts[0] !== "scrypt") {
      return false;
    }

    const salt = Buffer.from(parts[1], "hex");
    const storedKey = Buffer.from(parts[2], "hex");

    const derivedKey = crypto.scryptSync(
      normalizedCode,
      salt,
      storedKey.length
    );

    return crypto.timingSafeEqual(derivedKey, storedKey);
  } catch (error) {
    return false;
  }
}

function isValidAccessCodeFormat(accessCode) {
  if (typeof accessCode !== "string") {
    return false;
  }

  return /^MV-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(
    accessCode.trim().toUpperCase()
  );
}

module.exports = {
  generateAccessCode,
  hashAccessCode,
  verifyAccessCode,
  isValidAccessCodeFormat,
};