import assert from "node:assert/strict";
import test from "node:test";
import { uploadDecision, UPLOAD_LIMIT_BYTES, type UploadRequest } from "../src/pomelo/browser/upload-rule.js";

const fridayHome = "/fixture/friday";
const jobFolder = `${fridayHome}/jobs/one`;
const request: UploadRequest = {
  filePath: `${jobFolder}/reports/x.txt`,
  jobFolder,
  fridayHome,
  bytes: 1,
  origin: "https://example.com",
};

test("a file inside the job folder is allowed and reports only its basename", () => {
  const expected = { decision: "allow", reason: "in-job-folder", name: "x.txt" };
  assert.deepEqual(uploadDecision(request), expected);
  assert.deepEqual(uploadDecision({ ...request, filePath: `${jobFolder}\\reports/../x.txt` }), expected);
});

test("traversal and sibling prefixes do not count as being inside the job folder", () => {
  for (const filePath of [`${jobFolder}/../other/x.txt`, `${jobFolder}\\..\\other/x.txt`, `${jobFolder}-other/x.txt`]) {
    assert.deepEqual(uploadDecision({ ...request, filePath }), {
      decision: "refuse", reason: "inside-friday-home", name: "x.txt",
    });
  }
});

test("Friday home files outside the job folder are refused even with approval", () => {
  for (const filePath of [`${fridayHome}/profiles/p1/settings.json`, `/${fridayHome}/logs/run.log`]) {
    assert.deepEqual(uploadDecision({ ...request, filePath, approvedPaths: [filePath] }), {
      decision: "refuse", reason: "inside-friday-home", name: filePath.split("/").at(-1),
    });
  }
});

test("secret files and directories are refused even inside a job or with approval", () => {
  const paths = [
    `${fridayHome}/profiles/p1/Cookies`, "~/.ssh/id_ed25519", "/fixture/id_rsa",
    "/fixture/.gnupg/data", "/fixture/.aws/config", `${jobFolder}/.env`,
    "/fixture/.env.local", "/fixture/server.pem", "/fixture/server.key",
    "/fixture/store.kdbx", "/fixture/Login Data", `${jobFolder}/.env.local/nested.txt`,
    `${jobFolder}/fixture\nname.pem`,
  ];
  for (const filePath of paths) {
    const expected = { decision: "refuse", reason: "secret-store", name: filePath.split("/").at(-1) };
    assert.deepEqual(uploadDecision({ ...request, filePath }), expected);
    assert.deepEqual(uploadDecision({ ...request, filePath, approvedPaths: [filePath] }), expected);
  }
});

test("an ordinary file outside the job needs an exact normalized approval", () => {
  const filePath = "/fixture/Documents/x.txt";
  const held = { decision: "hold", reason: "needs-amit", name: "x.txt" };
  assert.deepEqual(uploadDecision({ ...request, filePath }), held);
  assert.deepEqual(uploadDecision({ ...request, filePath, approvedPaths: ["/fixture/Documents"] }), held);
  assert.deepEqual(uploadDecision({ ...request, filePath, approvedPaths: ["/fixture/Documents\\sub/../x.txt"] }), {
    decision: "allow", reason: "approved", name: "x.txt",
  });
});

test("the upload size limit holds even a job file and an approved file", () => {
  assert.equal(UPLOAD_LIMIT_BYTES, 50 * 1024 * 1024);
  assert.equal(uploadDecision({ ...request, bytes: UPLOAD_LIMIT_BYTES }).decision, "allow");
  const filePath = "/fixture/Documents/x.txt";
  const expected = { decision: "hold", reason: "too-large", name: "x.txt" };
  assert.deepEqual(uploadDecision({ ...request, bytes: 60 * 1024 * 1024 }), expected);
  assert.deepEqual(uploadDecision({ ...request, filePath, approvedPaths: [filePath], bytes: UPLOAD_LIMIT_BYTES + 1 }), expected);
});

test("non-HTTPS origins are held with an exception for loopback", () => {
  for (const origin of ["http://example.com", "http://localhost.example.com", "http://127.0.0.1.example.com"]) {
    assert.deepEqual(uploadDecision({ ...request, origin }), {
      decision: "hold", reason: "insecure-origin", name: "x.txt",
    });
  }
  for (const origin of ["http://127.0.0.1:3000", "http://localhost:3000", "http://[::1]:3000"]) {
    assert.equal(uploadDecision({ ...request, origin }).decision, "allow");
  }
});

test("Windows paths handle mixed separators, drive case and different drives", () => {
  const windows = { ...request, jobFolder: "c:\\Users\\a\\job", fridayHome: "C:/Users/a/friday" };
  assert.deepEqual(uploadDecision({ ...windows, filePath: "C:\\Users\\a\\job/x.txt" }), {
    decision: "allow", reason: "in-job-folder", name: "x.txt",
  });
  const filePath = "D:/Users/a/job/x.txt";
  assert.deepEqual(uploadDecision({ ...windows, filePath }), {
    decision: "hold", reason: "needs-amit", name: "x.txt",
  });
  assert.deepEqual(uploadDecision({ ...windows, filePath, approvedPaths: ["d:\\Users\\a\\job\\x.txt"] }), {
    decision: "allow", reason: "approved", name: "x.txt",
  });
  assert.deepEqual(uploadDecision({ ...windows, filePath: "c:\\Users\\a\\job\\.SSH\\config" }), {
    decision: "refuse", reason: "secret-store", name: "config",
  });
});

test("Windows network shares keep their own roots and unqualified paths stay on hold", () => {
  const windows = { ...request, fridayHome: "\\\\server\\share\\friday", jobFolder: "//server/share/friday/jobs/one" };
  assert.deepEqual(uploadDecision({ ...windows, filePath: "//SERVER/share/friday/jobs/one/x.txt" }), {
    decision: "allow", reason: "in-job-folder", name: "x.txt",
  });
  for (const filePath of ["//server/other/friday/jobs/one/x.txt", "/friday/jobs/one/x.txt", "x.txt"]) {
    assert.deepEqual(uploadDecision({ ...windows, filePath }), {
      decision: "hold", reason: "needs-amit", name: "x.txt",
    });
  }
  const filePath = "/friday/profiles/p1/x.txt";
  assert.deepEqual(uploadDecision({ ...windows, filePath, approvedPaths: [filePath] }), {
    decision: "hold", reason: "needs-amit", name: "x.txt",
  });
});

test("malformed requests are refused without echoing the input", () => {
  const malformed = [
    null, {}, { ...request, filePath: "" }, { ...request, filePath: `${jobFolder}/x\0.txt` },
    { ...request, filePath: 1 }, { ...request, jobFolder: "" }, { ...request, fridayHome: 1 },
    { ...request, bytes: -1 }, { ...request, bytes: NaN }, { ...request, origin: "example.com" },
    { ...request, approvedPaths: [request.filePath, 1] },
  ];
  for (const input of malformed) {
    assert.deepEqual(uploadDecision(input as UploadRequest), { decision: "refuse", reason: "bad-input" });
  }
});
