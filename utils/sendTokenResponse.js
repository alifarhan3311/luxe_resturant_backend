/**
 * sendTokenResponse
 *
 * ROOT CAUSE FIX — cross-origin cookie problem:
 *
 * Frontend: https://luxe-resturant-front-end.vercel.app
 * Backend:  https://luxe-resturant-backend.vercel.app
 *
 * These are DIFFERENT origins (cross-site). Browser rules for cookies:
 *
 *  SameSite=Strict  → cookie NOT sent/set on ANY cross-site request  ← was broken
 *  SameSite=Lax     → cookie NOT SET by cross-site POST (Set-Cookie blocked) ← also broken
 *  SameSite=None    → cookie sent/set cross-site BUT requires Secure=true ← CORRECT
 *
 * So for cross-origin deployments: sameSite must be "none" + secure must be true.
 *
 * Additionally: token is ALWAYS returned in the response body so the frontend
 * can store it in memory (React state) and send it via Authorization header.
 * This is the correct pattern when cross-origin httpOnly cookies are unreliable.
 */
const sendTokenResponse = (user, statusCode, res) => {
  const token  = user.getSignedJwtToken();
  const isProd = process.env.NODE_ENV === "production";

  const cookieOptions = {
    expires:  new Date(
      Date.now() + (Number(process.env.JWT_COOKIE_EXPIRE) || 7) * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    // cross-origin (different Vercel subdomains) requires SameSite=None + Secure
    secure:   true,          // always true — Vercel is always HTTPS
    sameSite: "none",        // allows cross-origin cookie (required for Vercel split deploy)
  };

  // Safe user fields only — never expose password/tokens
  const userSafe = {
    _id:    user._id,
    name:   user.name,
    email:  user.email,
    phone:  user.phone,
    role:   user.role,
    avatar: user.avatar,
  };

  // Always return token in body — frontend stores in memory + localStorage fallback
  // httpOnly cookie is set as additional security layer
  res
    .status(statusCode)
    .cookie("token", token, cookieOptions)
    .json({ success: true, token, user: userSafe });
};

module.exports = sendTokenResponse;
