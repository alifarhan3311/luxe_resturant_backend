/**
 * sendTokenResponse — OWASP A02 / A07
 *
 * - JWT stored in httpOnly + Secure + SameSite=Strict cookie (not localStorage)
 * - Token also returned in body ONLY in development (so Postman still works)
 * - In production the body never carries the raw JWT — frontend must rely on cookie
 * - __Secure- prefix added in production so browser rejects cookie over plain HTTP
 * - Only safe user fields returned — never password, loginAttempts, lockUntil etc.
 */
const sendTokenResponse = (user, statusCode, res) => {
  const token = user.getSignedJwtToken();
  const isProd = process.env.NODE_ENV === "production";

  const cookieOptions = {
    expires:  new Date(Date.now() + (Number(process.env.JWT_COOKIE_EXPIRE) || 7) * 24 * 60 * 60 * 1000),
    httpOnly: true,                         // A02: JS cannot read this cookie
    secure:   isProd,                       // A02: HTTPS only in production
    sameSite: isProd ? "strict" : "lax",    // A01: CSRF mitigation
  };

  // Safe user payload — never include sensitive fields
  const userSafe = {
    _id:    user._id,
    name:   user.name,
    email:  user.email,
    phone:  user.phone,
    role:   user.role,
    avatar: user.avatar,
  };

  const body = { success: true, user: userSafe };

  // Only expose raw JWT in non-production (Postman / dev testing)
  if (!isProd) body.token = token;

  res
    .status(statusCode)
    .cookie("token", token, cookieOptions)
    .json(body);
};

module.exports = sendTokenResponse;
