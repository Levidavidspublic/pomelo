import assert from "node:assert/strict";
import test from "node:test";
import { diskSpace } from "../src/pomelo/disk-space.js";

const linuxHeader = "Filesystem     1K-blocks      Used Available Use% Mounted on";
const rootRow = "/dev/root       52428800  10485760  41943040  20% /";

test("enough free space lets the run proceed and reports the mount for each folder", () => {
  const result = diskSpace(`${linuxHeader}\n${rootRow}\n`, ["/repo", "/worktrees", "/friday"]);
  assert.equal(result.action, "go");
  assert.deepEqual(result.mounts, ["/repo", "/worktrees", "/friday"].map((path) => ({
    mount: "/", path, freeKb: 41_943_040, usedPercent: 20,
  })));
});

test("3 GB free calls for cleanup and names the mount and folder", () => {
  const dataRow = "/dev/data        8388608   5242880   3145728  63% /data";
  const result = diskSpace(`${linuxHeader}\n${rootRow}\n${dataRow}`, ["/repo", "/data/kitchen"]);
  assert.equal(result.action, "clean");
  assert.match(result.reason, /\/data\b/);
  assert.match(result.reason, /\/data\/kitchen\b/);
});

test("500 MB free stops the run even below the usage threshold", () => {
  const dataRow = "/dev/data        1024000    512000    512000  50% /data";
  const result = diskSpace(`${linuxHeader}\n${rootRow}\n${dataRow}`, ["/data/kitchen", "/repo"]);
  assert.equal(result.action, "stop");
  assert.match(result.reason, /\/data\b/);
  assert.equal(result.mounts.length, 2);
});

test("96% used stops the run even with many GB free and takes priority over cleanup", () => {
  const cleanRow = "/dev/data        8388608   5242880   3145728  63% /data";
  const stopRow = "/dev/store    1048576000 1006632960  41943040  96% /store";
  const result = diskSpace(`${linuxHeader}\n${rootRow}\n${cleanRow}\n${stopRow}`, ["/data/kitchen", "/store/friday", "/repo"]);
  assert.equal(result.action, "stop");
  assert.match(result.reason, /\/store\/friday\b/);
  assert.match(result.reason, /96%/);
  assert.equal(result.mounts[1].freeKb, 41_943_040);
});

test("the longest mount wins at a path boundary or when the path is the mount itself", () => {
  const dataRow = "/dev/data        8388608   5242880   3145728  63% /data";
  const nestedRow = "/dev/cache      52428800  10485760  41943040  20% /data/cache";
  const result = diskSpace(`${linuxHeader}\n${nestedRow}\n${rootRow}\n${dataRow}`, [
    "/data/kitchen", "/data2/kitchen", "/data/cache/test", "/data",
  ]);
  assert.deepEqual(result.mounts.map(({ mount }) => mount), ["/data", "/", "/data/cache", "/data"]);
});

test("macOS inode columns and spaces in the filesystem and mount preserve the disk numbers", () => {
  const macHeader = "Filesystem 1024-blocks      Used Available Capacity iused ifree %iused Mounted on";
  const macRow = "//build share  52428800  10485760  41943040      20%    99     1    99% /Volumes/Build  Disk";
  const result = diskSpace(`${macHeader}\r\n${macRow}\r\n`, ["/Volumes/Build  Disk/worktrees"]);
  assert.equal(result.action, "go");
  assert.deepEqual(result.mounts, [
    { mount: "/Volumes/Build  Disk", path: "/Volumes/Build  Disk/worktrees", freeKb: 41_943_040, usedPercent: 20 },
  ]);
});

test("a folder with no matching mount stops the run and names the folder", () => {
  const dataRow = "/dev/data        8388608   5242880   3145728  63% /data";
  const result = diskSpace(`${linuxHeader}\n${dataRow}`, ["/data/repo", "/data2/worktrees"]);
  assert.equal(result.action, "stop");
  assert.match(result.reason, /\/data2\/worktrees\b/);
});

test("missing or unreadable disk data stops the run with a reason", () => {
  const badRow = "/dev/data        unknown   5242880   3145728  63% /data";
  for (const dfText of ["", linuxHeader, `${linuxHeader}\n${rootRow}\n${badRow}`]) {
    const result = diskSpace(dfText, ["/repo"]);
    assert.equal(result.action, "stop", dfText);
    assert.ok(result.reason.trim());
  }
});

test("default free-space limits are exclusive and usage limits are inclusive", () => {
  const dataRow = (freeKb: number, usedPercent: number) => `/dev/data 104857600 100663296 ${freeKb} ${usedPercent}% /data`;
  const check = (freeKb: number, usedPercent: number) => diskSpace(`${linuxHeader}\n${dataRow(freeKb, usedPercent)}`, ["/data"]);
  assert.equal(check(1_048_575, 10).action, "stop");
  assert.equal(check(1_048_576, 10).action, "clean");
  assert.equal(check(5_242_879, 10).action, "clean");
  assert.equal(check(5_242_880, 84).action, "go");
  assert.equal(check(5_242_880, 85).action, "clean");
  assert.equal(check(5_242_880, 95).action, "stop");
});

test("custom free-space and usage limits override the defaults", () => {
  const limits = { stopFreeKb: 1024, cleanFreeKb: 2048, stopUsedPercent: 80, cleanUsedPercent: 70 };
  const dataRow = (freeKb: number, usedPercent: number) => `/dev/data 4096 2048 ${freeKb} ${usedPercent}% /data`;
  const check = (freeKb: number, usedPercent: number) => diskSpace(`${linuxHeader}\n${dataRow(freeKb, usedPercent)}`, ["/data"], limits);
  assert.equal(check(2048, 69).action, "go");
  assert.equal(check(2047, 69).action, "clean");
  assert.equal(check(1023, 69).action, "stop");
  assert.equal(check(2048, 70).action, "clean");
  assert.equal(check(2048, 80).action, "stop");
});
