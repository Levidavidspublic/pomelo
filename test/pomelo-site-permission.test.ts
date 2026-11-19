import assert from "node:assert/strict";
import test from "node:test";
import { sitePermission } from "../src/pomelo/browser/site-permission.js";

const site = { origin: "https://example.com", frame: "top", target: "local" } as const;

test("camera, microphone and geolocation need a local target and site approval", () => {
  for (const permission of ["camera", "microphone", "geolocation"] as const) {
    const request = { ...site, permission };
    const allowList = [{ origin: site.origin, permission }];
    for (const entries of [[], allowList]) {
      assert.deepEqual(sitePermission({ ...request, target: "cloud" }, entries), {
        decision: "deny", reason: "no-device-on-cloud",
      });
    }
    assert.deepEqual(sitePermission(request, []), { decision: "hold", reason: "needs-amit" });
    assert.deepEqual(sitePermission(request, allowList), { decision: "allow", reason: "allowed" });
    assert.deepEqual(sitePermission({ ...request, frame: "child" }, allowList), {
      decision: "deny", reason: "child-frame",
    });
  }
});

test("clipboard reads are blocked even with site approval", () => {
  const permission = "clipboard-read";
  assert.deepEqual(sitePermission({ ...site, permission }, [{ origin: site.origin, permission }]), {
    decision: "deny", reason: "clipboard-read-blocked",
  });
});

test("only an HTTPS top frame can write to the clipboard", () => {
  const permission = "clipboard-write";
  const request = { ...site, permission };
  assert.deepEqual(sitePermission(request, []), { decision: "allow", reason: "allowed" });
  assert.deepEqual(sitePermission({ ...request, frame: "child" }, [{ origin: site.origin, permission }]), {
    decision: "deny", reason: "child-frame",
  });
  for (const origin of ["http://example.com", "http://localhost", "http://127.0.0.1"]) {
    assert.deepEqual(sitePermission({ ...request, origin }, [{ origin, permission }]), {
      decision: "deny", reason: "insecure-origin",
    });
  }
});

test("notifications require approval for that permission and a top frame", () => {
  const permission = "notifications";
  const request = { ...site, permission };
  const allowList = [{ origin: site.origin, permission }];
  for (const entries of [[], [{ origin: site.origin, permission: "camera" }]]) {
    assert.deepEqual(sitePermission(request, entries), { decision: "deny", reason: "not-allowed" });
  }
  assert.deepEqual(sitePermission({ ...request, target: "cloud" }, allowList), {
    decision: "allow", reason: "allowed",
  });
  assert.deepEqual(sitePermission({ ...request, frame: "child" }, allowList), {
    decision: "deny", reason: "child-frame",
  });
});

test("approval matches the exact origin with case-insensitive hosts", () => {
  const permission = "camera";
  const request = { ...site, permission };
  const allowList = [{ origin: site.origin, permission }];
  for (const origin of ["https://evil.example.com", "https://example.com.evil.test", "https://example.com:8443"]) {
    assert.deepEqual(sitePermission({ ...request, origin }, allowList), { decision: "hold", reason: "needs-amit" });
  }
  assert.deepEqual(sitePermission({ ...request, origin: "http://example.com" }, allowList), {
    decision: "deny", reason: "insecure-origin",
  });
  assert.deepEqual(sitePermission({ ...request, origin: "https://ExAmPlE.com" }, allowList), {
    decision: "allow", reason: "allowed",
  });
  assert.deepEqual(sitePermission(request, [{ origin: "https://EXAMPLE.COM", permission }]), {
    decision: "allow", reason: "allowed",
  });
  const portOrigin = "https://example.com:8443";
  assert.deepEqual(sitePermission({ ...request, origin: portOrigin }, [{ origin: portOrigin, permission }]), {
    decision: "allow", reason: "allowed",
  });
  const wildcard = "https://*.example.com";
  assert.deepEqual(sitePermission({ ...request, origin: wildcard }, [{ origin: wildcard, permission }]), {
    decision: "deny", reason: "bad-input",
  });
  assert.deepEqual(sitePermission({ ...request, origin: "https://evil.example.com" }, [{ origin: wildcard, permission }]), {
    decision: "deny", reason: "bad-input",
  });
});

test("only the two named loopback hosts qualify over HTTP", () => {
  const permission = "camera";
  for (const origin of ["http://localhost", "http://127.0.0.1:8080"]) {
    const request = { ...site, origin, permission };
    assert.deepEqual(sitePermission(request, []), { decision: "hold", reason: "needs-amit" });
    assert.deepEqual(sitePermission(request, [{ origin, permission }]), { decision: "allow", reason: "allowed" });
  }
  for (const origin of ["http://localhost.example.com", "http://dev.localhost", "http://127.0.0.2", "http://[::1]", "ftp://localhost"]) {
    assert.deepEqual(sitePermission({ ...site, origin, permission }, [{ origin, permission }]), {
      decision: "deny", reason: "insecure-origin",
    });
  }
});

test("unknown permissions return a fixed denial reason", () => {
  const permission = "page-supplied-name";
  for (const allowList of [[], [{ origin: site.origin, permission }]]) {
    assert.deepEqual(sitePermission({ ...site, permission }, allowList), {
      decision: "deny", reason: "unknown-permission",
    });
  }
});

test("malformed inputs return a fixed denial reason without throwing", () => {
  const request = { ...site, permission: "camera" };
  const badInput = { decision: "deny", reason: "bad-input" };
  for (const value of [
    null,
    { permission: "camera", frame: "top", target: "local" },
    { ...request, origin: "not-a-url" },
    { ...request, origin: "https://example.com/page?label=sample" },
    { ...request, frame: "other" },
    { ...request, target: "other" },
    { ...site, permission: 42 },
    { ...request, get origin() { throw new Error("invalid request"); } },
  ]) {
    assert.deepEqual(sitePermission(value, []), badInput);
  }
  for (const allowList of [null, {}, [null], [{ origin: site.origin }], [{ ...request, origin: "not-a-url" }]]) {
    assert.deepEqual(sitePermission(request, allowList), badInput);
  }
});
