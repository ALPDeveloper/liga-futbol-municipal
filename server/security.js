const PASSWORD_MIN_LENGTH = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USER_ROLES = new Set(["super_admin", "league_admin", "admin_limited", "team_delegate", "referee"]);
const USER_STATUSES = new Set(["pending_activation", "active", "disabled", "suspended", "deleted"]);
const ACCESS_ROLES = new Set(["super_admin", "league_admin", "admin_limited", "team_delegate", "referee"]);
const ADMIN_PERMISSIONS = new Set([
  "calendar",
  "matches",
  "referees",
  "match_sheets",
  "teams",
  "players",
  "discipline",
  "delegates",
  "settings",
  "media",
  "users",
  "read_only"
]);

export function applySecurityHeaders(request, response, next) {
  response.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "media-src 'self' https:",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'"
    ].join("; ")
  );
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Cross-Origin-Resource-Policy", "same-site");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (request.app.get("env") === "production") {
    response.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  next();
}

export function createRateLimiter({ windowMs, max, keyGenerator }) {
  const attempts = new Map();

  return (request, response, next) => {
    const now = Date.now();
    if (attempts.size > 10000) {
      for (const [attemptKey, attemptBucket] of attempts.entries()) {
        if (attemptBucket.resetAt <= now) attempts.delete(attemptKey);
      }
    }
    const key = keyGenerator(request);
    const bucket = attempts.get(key) || { count: 0, resetAt: now + windowMs };

    if (bucket.resetAt <= now) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    attempts.set(key, bucket);

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      response.setHeader("Retry-After", String(retryAfter));
      return response.status(429).json({ error: "Demasiados intentos. Intenta de nuevo mas tarde." });
    }

    next();
  };
}

export function validatePasswordStrength(password) {
  const value = String(password || "");
  const problems = [];

  if (value.length < PASSWORD_MIN_LENGTH) problems.push(`minimo ${PASSWORD_MIN_LENGTH} caracteres`);
  if (!/[a-z]/.test(value)) problems.push("una minuscula");
  if (!/[A-Z]/.test(value)) problems.push("una mayuscula");
  if (!/\d/.test(value)) problems.push("un numero");

  return {
    valid: problems.length === 0,
    message: problems.length
      ? `La contraseña debe tener ${problems.join(", ")}.`
      : ""
  };
}

export function requireStrongPassword(password) {
  const result = validatePasswordStrength(password);
  if (result.valid) return "";
  return result.message;
}

export function validateEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  return EMAIL_PATTERN.test(value) && value.length <= 254;
}

export function validateUserRole(role) {
  return USER_ROLES.has(String(role || ""));
}

export function validateUserStatus(status) {
  return USER_STATUSES.has(String(status || ""));
}

export function validateAccessRole(role) {
  return ACCESS_ROLES.has(String(role || ""));
}

export function normalizeAdminPermissions(value) {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(source.map((item) => String(item || "").trim()).filter((item) => ADMIN_PERMISSIONS.has(item)))];
}

export function getDefaultPermissionsForRole(role) {
  if (role === "super_admin" || role === "league_admin") return ["*"];
  return [];
}

export function validateStorePayload(payload) {
  return payload && typeof payload === "object" && Array.isArray(payload.leagues);
}

export function sanitizePublicStore(store, options = {}) {
  const excludePrivateLeagues = Boolean(options.excludePrivateLeagues);
  return {
    ...store,
    leagues: (store.leagues || [])
      .filter((league) => !excludePrivateLeagues || (league.publicVisibility || "visible") !== "private")
      .map((league) => ({
      ...league,
      ownerEmail: "",
      renewalDate: "",
      membershipNotes: "",
      plan: "",
      matchRosters: [],
      sponsors: (league.sponsors || [])
        .filter((sponsor) => sponsor.status === "active")
        .map((sponsor) => ({
          id: sponsor.id,
          name: sponsor.name,
          placement: sponsor.placement,
          status: sponsor.status,
          imageUrl: sponsor.imageUrl,
          linkUrl: sponsor.linkUrl,
          sortOrder: sponsor.sortOrder
        })),
      rules: {
        withdrawalPolicy: league.rules?.withdrawalPolicy,
        forfeitPoints: league.rules?.forfeitPoints,
        forfeitGoalsFor: league.rules?.forfeitGoalsFor,
        forfeitGoalsAgainst: league.rules?.forfeitGoalsAgainst,
        yellowSuspensionLimit: league.rules?.yellowSuspensionLimit,
        defaultRedSuspensionMatches: league.rules?.defaultRedSuspensionMatches,
        playoffQualifiers: league.rules?.playoffQualifiers,
        minimumPlayoffAppearances: league.rules?.minimumPlayoffAppearances
      }
    }))
  };
}

export function scopeStoreForUser(store, user) {
  if (!user) return sanitizePublicStore(store, { excludePrivateLeagues: true });
  if (user.role === "super_admin") return store;
  const adminAccesses = (user.accesses || []).filter((access) => ["super_admin", "league_admin", "admin_limited"].includes(access.role));
  if (adminAccesses.some((access) => access.role === "super_admin")) return store;
  const leagueAccessIds = adminAccesses
    .map((access) => access.leagueId)
    .filter(Boolean);
  if (leagueAccessIds.length) {
    const leagues = (store.leagues || []).filter((league) => leagueAccessIds.includes(league.id));
    return {
      ...store,
      currentLeagueId: leagueAccessIds[0],
      leagues: sanitizePublicStore({ ...store, leagues }).leagues
    };
  }
  const portalLeagueAccessIds = [
    ...new Set((user.accesses || [])
      .filter((access) => access.status === "active" && ["team_delegate", "referee"].includes(access.role) && access.leagueId)
      .map((access) => access.leagueId))
  ];
  if (portalLeagueAccessIds.length) {
    const leagues = (store.leagues || []).filter((league) => portalLeagueAccessIds.includes(league.id));
    return {
      ...store,
      currentLeagueId: portalLeagueAccessIds[0],
      leagues: sanitizePublicStore({ ...store, leagues }).leagues
    };
  }
  if (user.role === "referee") return sanitizePublicStore(store, { excludePrivateLeagues: true });
  if (user.role !== "league_admin" || !user.leagueId) return sanitizePublicStore(store);

  const leagues = (store.leagues || []).filter((league) => league.id === user.leagueId);
  return {
    ...store,
    currentLeagueId: user.leagueId,
    leagues: sanitizePublicStore({ ...store, leagues }).leagues
  };
}
