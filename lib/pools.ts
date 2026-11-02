// Web stats page of the pool a miner is connected to, for the wallet it mines to.
// The stratum user is "<bitcoin address>[.<worker>]" on solo pools.

const BTC_ADDRESS = /^(bc1|tb1|[13])[a-zA-HJ-NP-Z0-9]{20,90}$/;

/** "bc1q…xyz.worker3" -> "bc1q…xyz", or undefined if the user is not a bitcoin address. */
export function walletOf(user?: string): string | undefined {
  const addr = user?.trim().split(".")[0];
  return addr && BTC_ADDRESS.test(addr) ? addr : undefined;
}

/**
 * Stats page for known pools (checked by hand):
 *   Braiins Solo  solo.stratum.braiins.com -> https://solo.braiins.com/stats/<address>
 *   ckpool solo   solo.ckpool.org, eusolo.ckpool.org, ... -> https://<host>/users/<address>
 * Unknown pools get no link rather than a guessed one.
 */
export function poolStatsUrl(host?: string, user?: string): string | undefined {
  const h = host?.trim().toLowerCase().replace(/^stratum\+tcp:\/\//, "");
  const addr = walletOf(user);
  if (!h) return undefined;
  if (h.endsWith("braiins.com") && h.includes("solo")) {
    return addr ? `https://solo.braiins.com/stats/${addr}` : "https://solo.braiins.com/";
  }
  if (/^[a-z]*solo\.ckpool\.org$/.test(h)) {
    return addr ? `https://${h}/users/${addr}` : `https://${h}/`;
  }
  return undefined;
}
