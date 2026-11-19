#!/usr/bin/env python3
"""Regression checks against a source archive in a disposable directory."""
import os
import stat
import subprocess
import sys
import tempfile
import zipfile

source, commit = sys.argv[1:]
audit = os.path.join(os.path.dirname(__file__), "audit-release-zip.py")

def run(path, *extra):
    return subprocess.run([sys.executable, audit, path, "--commit", commit, *extra], capture_output=True, text=True)

assert run(source).returncode == 0, "valid source archive was rejected"
assert run(source, "--sha256", "0" * 64).returncode != 0, "wrong digest was accepted"
with tempfile.TemporaryDirectory(prefix="portfolio-zip-test-") as directory:
    def mutate(name, extra=None, replace=None, omit=None):
        target = os.path.join(directory, name + ".zip")
        with zipfile.ZipFile(source) as old, zipfile.ZipFile(target, "w") as new:
            new.comment = old.comment
            for entry in old.infolist():
                if entry.filename == omit:
                    continue
                if replace and entry.filename == replace[0]:
                    new.writestr(replace[1], replace[2])
                else:
                    new.writestr(entry, old.read(entry))
            if extra:
                new.writestr(extra[0], extra[1])
        return target

    for name, path in [
        ("traversal", mutate("traversal", extra=("../escape.txt", "x"))),
        ("backslash", mutate("backslash", extra=("bad\\path.txt", "x"))),
        ("credential", mutate("credential", extra=(".env.local", "fixture"))),
        ("missing-license", mutate("missing-license", omit="LICENSE")),
        ("tampered", mutate("tampered", replace=("README.md", "README.md", "modified"))),
    ]:
        assert run(path).returncode != 0, name + " archive was accepted"
    link = zipfile.ZipInfo("README.md")
    link.create_system = 3
    link.external_attr = (stat.S_IFLNK | 0o777) << 16
    assert run(mutate("symlink", replace=("README.md", link, "target"))).returncode != 0, "symlink was accepted"
    assert run(mutate("duplicate", extra=("README.md", "duplicate"))).returncode != 0, "duplicate path was accepted"
    trailing = mutate("trailing")
    with open(trailing, "ab") as stream:
        stream.write(b"untracked data")
    assert run(trailing).returncode != 0, "trailing data was accepted"
print("Release ZIP negative checks passed: digest, traversal, separators, env file, manifest, tampering, symlink, duplicate path and trailing data.")
