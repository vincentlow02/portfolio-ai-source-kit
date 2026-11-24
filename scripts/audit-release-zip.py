#!/usr/bin/env python3
"""Audit a release ZIP against a committed Git tree without extracting it."""
import argparse
import hashlib
import posixpath
import re
import stat
import subprocess
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("archive")
parser.add_argument("--commit", required=True, help="Exact Git commit or tag to compare")
parser.add_argument("--sha256", help="Expected ZIP SHA-256")
parser.add_argument("--allow-legacy-crlf", action="store_true", help="Permit line-ending-only differences when auditing the historical V1.0.0 asset")
args = parser.parse_args()

def fail(message):
    raise SystemExit(message)

with open(args.archive, "rb") as stream:
    digest = hashlib.file_digest(stream, "sha256").hexdigest()
    stream.seek(0, 2)
    size = stream.tell()
    if size > 25_000_000:
        fail("Archive exceeds the audit size limit")
    stream.seek(max(0, size - 65_557))
    trailer = stream.read()
    end = trailer.rfind(b"PK\x05\x06")
    if end < 0 or end + 22 > len(trailer) or end + 22 + int.from_bytes(trailer[end + 20:end + 22], "little") != len(trailer):
        fail("Archive has an invalid end record or trailing data")
if args.sha256 and digest != args.sha256.lower():
    fail("Archive SHA-256 does not match")

commit = subprocess.check_output(["git", "rev-parse", "--verify", args.commit + "^{commit}"], text=True).strip()
tree = subprocess.check_output(["git", "ls-tree", "-rz", "--full-tree", commit])
expected = {}
for item in tree.split(b"\0"):
    if not item:
        continue
    metadata, raw_path = item.split(b"\t", 1)
    mode, kind, oid = metadata.decode("ascii").split()
    path = raw_path.decode("utf-8")
    if kind != "blob" or mode not in ("100644", "100755"):
        fail("Git tree contains a symbolic link or non-regular file: " + path)
    expected[path] = oid

required = {"LICENSE", "PORTFOLIO_AI_LICENSE", "THIRD_PARTY_NOTICES.md", "README.md", "docs/integration.md"}
if not required <= expected.keys():
    fail("Required license or documentation is absent from the Git tree")

excluded = re.compile(r"(?:^|/)(?:\.env(?!\.example$)|node_modules|\.next|\.portfolio-knowledge|\.vercel|private)(?:/|$)|\.(?:png|jpe?g|webp|gif|svg|mp[34]|mov|woff2?|ttf|pdf|docx?)$", re.I)
widget_icon = re.compile(r"scripts/portfolio-chat/local-preview/icons/(sparkles|reset|close|suggestion|send|followup|quote|remove|select)\.svg")
portfolio = re.compile(r"(?<![a-z0-9])(?:" + "into" + "day|go" + "event|weave" + r" ai|cur" + r"io)(?![a-z0-9])|vincent" + r"low\.work", re.I)
secrets = re.compile(r"(?:sk-[A-Za-z0-9_-]{30,}|sb_secret_[A-Za-z0-9_-]{30,}|gh[pousr]_[A-Za-z0-9_]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)")

with zipfile.ZipFile(args.archive) as archive:
    entries = archive.infolist()
    if archive.comment != commit.encode("ascii") or not entries or entries[0].header_offset != 0:
        fail("Archive provenance comment or start offset is invalid")
    if len(entries) > 1000 or sum(entry.file_size for entry in entries) > 20_000_000:
        fail("Archive exceeds the audit size limit")
    seen = set()
    files = {}
    for entry in entries:
        name = entry.filename
        stripped = name[:-1] if entry.is_dir() else name
        parts = stripped.split("/")
        if name != entry.orig_filename or not stripped or "\\" in name or name.startswith("/") or re.match(r"^[A-Za-z]:", name) or any(part in ("", ".", "..") for part in parts):
            fail("Unsafe archive path: " + repr(name))
        canonical = stripped.casefold()
        if canonical in seen:
            fail("Duplicate or case-colliding archive path: " + name)
        seen.add(canonical)
        mode = entry.external_attr >> 16
        kind = stat.S_IFMT(mode)
        if kind and kind != (stat.S_IFDIR if entry.is_dir() else stat.S_IFREG):
            fail("Archive contains a symbolic link or non-regular entry: " + name)
        if entry.is_dir():
            if not any(path.startswith(name) for path in expected):
                fail("Unexpected archive directory: " + name)
            continue
        if excluded.search(name) and not widget_icon.fullmatch(name):
            fail("Excluded archive path: " + name)
        files[name] = entry
    if files.keys() != expected.keys():
        fail("Archive file manifest differs from the requested commit")
    legacy = 0
    text_files = {}
    for name, entry in files.items():
        raw = archive.read(entry)
        if b"\0" in raw:
            fail("Unexpected binary file: " + name)
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            fail("Non-UTF-8 file: " + name)
        if portfolio.search(text) or secrets.search(text):
            fail("Excluded portfolio reference or candidate credential: " + name)
        blob = subprocess.check_output(["git", "cat-file", "blob", expected[name]])
        if raw != blob:
            if args.allow_legacy_crlf and raw.replace(b"\r\n", b"\n") == blob.replace(b"\r\n", b"\n"):
                legacy += 1
            else:
                fail("Archive content differs from the requested commit: " + name)
        text_files[name] = text
    for name in ("README.md", "docs/integration.md"):
        for target in re.findall(r"\]\(([^)]+)\)", text_files[name]):
            target = target.split("#", 1)[0]
            if not target or re.match(r"^(?:https?://|mailto:)", target):
                continue
            resolved = posixpath.normpath(posixpath.join(posixpath.dirname(name), target))
            if resolved.startswith("../") or (resolved not in files and not any(path.startswith(resolved.rstrip("/") + "/") for path in files)):
                fail("Broken or unsafe documentation link in " + name + ": " + target)
print(f"ZIP audit passed: {len(files)} files, SHA-256 {digest}, legacy line-ending differences {legacy}.")
