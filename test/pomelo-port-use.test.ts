import assert from "node:assert/strict";
import test from "node:test";
import { checkPorts } from "../src/pomelo/port-use.js";

const header = "State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process";
const redis = 'LISTEN 0      511    0.0.0.0:6379      0.0.0.0:*         users:(("redis-server",pid=456,fd=6))';
const node = 'LISTEN 0      511    127.0.0.1:5173    0.0.0.0:*         users:(("node",pid=123,fd=20))';
const friday = 'LISTEN 0      511    [::]:3000         [::]:*            users:(("friday",pid=789,fd=9))';
const hidden = "LISTEN 0      511    *:8080             *:*";
const report = [header, redis, node, friday, hidden, ""].join("\n");
const policy = { mayStop: ["redis-server"], protect: ["friday"], protectPids: [123] };

test("goes ahead when every needed port is free and ignores unrelated listeners", () => {
  const result = checkPorts(report, { ...policy, need: [4000, 9000] });
  assert.equal(result.ok, true);
  assert.equal(result.verdict, "go");
  assert.deepEqual(result.taken, []);
  assert.match(result.reason, /^go\b.*needed ports are free\.$/);
});

test("calls for cleanup of scratch Redis and names its port, program and PID", () => {
  const result = checkPorts(report, { ...policy, need: [6379] });
  assert.equal(result.ok, false);
  assert.equal(result.verdict, "cleanup");
  assert.deepEqual(result.taken, [{ port: 6379, program: "redis-server", pid: 456, action: "cleanup" }]);
  assert.match(result.reason, /^cleanup\b.*6379.*redis-server.*456\b/);
});

test("accepts the iproute2 header with Process attached to Peer Address:Port", () => {
  const compactHeader = "State  Recv-Q Send-Q Local Address:Port Peer Address:PortProcess";
  const output = [compactHeader, redis].join("\n");

  assert.equal(checkPorts(output, { ...policy, need: [4000] }).verdict, "go");
  const result = checkPorts(output, { ...policy, need: [6379] });
  assert.equal(result.verdict, "cleanup");
  assert.deepEqual(result.taken, [{ port: 6379, program: "redis-server", pid: 456, action: "cleanup" }]);
});

test("protected names and PIDs take precedence over cleanup and list ports in order", () => {
  const result = checkPorts(report, {
    ...policy,
    need: [6379, 5173, 3000],
    mayStop: ["redis-server", "node", "friday"],
  });
  assert.equal(result.ok, false);
  assert.equal(result.verdict, "stop");
  assert.deepEqual(result.taken, [
    { port: 3000, program: "friday", pid: 789, action: "stop" },
    { port: 5173, program: "node", pid: 123, action: "stop" },
    { port: 6379, program: "redis-server", pid: 456, action: "cleanup" },
  ]);
  assert.match(result.reason, /^stop\b.*friday.*protected.*node.*protected PID/);
});

test("stops for a program outside the allowlist and for a listener with no process details", () => {
  const result = checkPorts(report, { ...policy, protectPids: [], need: [5173, 8080] });
  assert.equal(result.verdict, "stop");
  assert.deepEqual(result.taken, [
    { port: 5173, program: "node", pid: 123, action: "stop" },
    { port: 8080, program: null, pid: null, action: "stop" },
  ]);
  assert.match(result.reason, /^stop\b.*5173.*node.*123.*8080.*owner is unknown/);
});

test("reports one entry for a port shared by IPv4 and IPv6", () => {
  const redisV6 = redis.replace("0.0.0.0:6379", "[::]:6379").replace("0.0.0.0:*", "[::]:*");
  const result = checkPorts([header, redis, redisV6].join("\n"), { ...policy, need: [6379, 6379] });
  assert.equal(result.verdict, "cleanup");
  assert.deepEqual(result.taken, [{ port: 6379, program: "redis-server", pid: 456, action: "cleanup" }]);
});

test("a protected listener on the same port overrides an allowed listener in either order", () => {
  const fridayV6 = friday.replace("[::]:3000", "[::]:6379");
  for (const rows of [[redis, fridayV6], [fridayV6, redis]]) {
    const result = checkPorts([header, ...rows].join("\n"), { ...policy, need: [6379] });
    assert.equal(result.verdict, "stop");
    assert.deepEqual(result.taken, [{ port: 6379, program: "friday", pid: 789, action: "stop" }]);
  }
});

test("examines every process sharing a socket", () => {
  const shared = redis.replace("fd=6))", 'fd=6),("node",pid=123,fd=20))');
  const result = checkPorts([header, shared].join("\n"), { ...policy, need: [6379] });
  assert.equal(result.verdict, "stop");
  assert.deepEqual(result.taken, [{ port: 6379, program: "node", pid: 123, action: "stop" }]);
});

test("blank, header-only and garbage reports are unreadable", () => {
  for (const input of ["", " \r\n\t", header, "garbage text"]) {
    const result = checkPorts(input, { ...policy, need: [6379] });
    assert.equal(result.ok, false);
    assert.equal(result.verdict, "unreadable");
    assert.deepEqual(result.taken, []);
    assert.match(result.reason, /^unreadable\b.*stop/);
  }
});

test("a broken row prevents going ahead or cleaning up even with a readable row", () => {
  for (const broken of [
    "ss: failed to read sockets",
    "LISTEN 0 511 127.0.0.1:8080",
    "LISTEN 0 511 127.0.0.1:65536 *:*",
    redis.replace("fd=6))", "fd=6)"),
  ]) {
    const result = checkPorts([header, redis, broken].join("\n"), { ...policy, need: [6379] });
    assert.equal(result.ok, false);
    assert.equal(result.verdict, "unreadable", broken);
    assert.deepEqual(result.taken, [{ port: 6379, program: "redis-server", pid: 456, action: "cleanup" }]);
    assert.match(result.reason, /^unreadable\b.*line 3.*stop/);
  }
});

test("accepts CRLF line endings", () => {
  const result = checkPorts(report.replaceAll("\n", "\r\n"), { ...policy, need: [6379] });
  assert.equal(result.verdict, "cleanup");
  assert.deepEqual(result.taken, [{ port: 6379, program: "redis-server", pid: 456, action: "cleanup" }]);
});
