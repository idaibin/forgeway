#!/usr/bin/env python3
"""Inspect local build artifacts without extracting or executing them."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import zipfile


VERSION = "0.2.1"
ARCH_ALIASES = {
    "aarch64": "arm64",
    "arm64": "arm64",
    "arm64e": "arm64",
    "amd64": "x86_64",
    "x86-64": "x86_64",
    "x86_64": "x86_64",
    "i386": "i386",
    "i686": "i386",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run_tool(argv: list[str]) -> str | None:
    if not shutil.which(argv[0]):
        return None
    result = subprocess.run(argv, capture_output=True, text=True, check=False)
    return result.stdout.strip() if result.returncode == 0 else None


def normalize_arch(value: str) -> str | None:
    return ARCH_ALIASES.get(value.lower().strip(" ,:()"))


def detect_architectures(path: Path, file_type: str) -> tuple[list[str], str | None]:
    lipo = run_tool(["lipo", "-archs", str(path)])
    if lipo:
        values = sorted(
            {normalized for token in lipo.split() if (normalized := normalize_arch(token))}
        )
        if values:
            return values, "lipo -archs"

    lowered = file_type.lower()
    values = {
        canonical
        for alias, canonical in ARCH_ALIASES.items()
        if re.search(rf"(?<![a-z0-9_]){re.escape(alias)}(?![a-z0-9_])", lowered)
    }
    return sorted(values), "file" if values else None


def unsafe_member(name: str) -> bool:
    normalized = name.replace("\\", "/")
    pure = PurePosixPath(normalized)
    return pure.is_absolute() or ".." in pure.parts or bool(re.match(r"^[A-Za-z]:/", normalized))


def inspect_archive(path: Path, max_members: int) -> dict | None:
    try:
        if zipfile.is_zipfile(path):
            with zipfile.ZipFile(path) as archive:
                members = archive.infolist()
                names = [member.filename for member in members]
                unsafe_paths = [
                    member.filename for member in members
                    if unsafe_member(member.filename) or stat.S_ISLNK(member.external_attr >> 16)
                ]
            archive_format = "zip"
        elif tarfile.is_tarfile(path):
            with tarfile.open(path, mode="r:*") as archive:
                members = archive.getmembers()
                names = [member.name for member in members]
                unsafe_paths = [
                    member.name for member in members
                    if unsafe_member(member.name) or member.issym() or member.islnk()
                ]
            archive_format = "tar"
        else:
            return None
    except (OSError, tarfile.TarError, zipfile.BadZipFile) as exc:
        return {
            "format": "unreadable",
            "member_count": 0,
            "members": [],
            "members_truncated": False,
            "unsafe_paths": [],
            "error": str(exc),
        }
    return {
        "format": archive_format,
        "member_count": len(names),
        "members": names[:max_members],
        "members_truncated": len(names) > max_members,
        "unsafe_paths": unsafe_paths,
    }


def all_archive_members(path: Path, archive_format: str) -> set[str]:
    if archive_format == "zip":
        with zipfile.ZipFile(path) as archive:
            return set(archive.namelist())
    if archive_format == "tar":
        with tarfile.open(path, mode="r:*") as archive:
            return set(archive.getnames())
    return set()


def inspect_path(path: Path, max_members: int) -> dict:
    resolved = path.expanduser().resolve()
    item: dict = {"path": str(resolved), "exists": resolved.exists()}
    if not resolved.exists():
        return item
    item["kind"] = "directory" if resolved.is_dir() else "file"
    if resolved.is_dir():
        entries = sorted(child.name for child in resolved.iterdir())
        item.update(
            entry_count=len(entries),
            entries=entries[:max_members],
            entries_truncated=len(entries) > max_members,
        )
        return item

    item["size"] = resolved.stat().st_size
    item["sha256"] = sha256(resolved)
    file_type = run_tool(["file", "-b", str(resolved)]) or "unknown"
    item["file_type"] = file_type
    architectures, source = detect_architectures(resolved, file_type)
    item["architectures"] = architectures
    item["architecture_source"] = source
    archive = inspect_archive(resolved, max_members)
    if archive is not None:
        item["archive"] = archive
    return item


def inspect_artifacts(
    paths: list[Path], expected_arches: list[str], required_members: list[str], max_members: int
) -> dict:
    expected = sorted({normalize_arch(value) or value.lower() for value in expected_arches})
    artifacts = [inspect_path(path, max_members) for path in paths]
    checks: list[dict] = []
    for artifact in artifacts:
        path = artifact["path"]
        exists = bool(artifact.get("exists"))
        checks.append({"check": "exists", "path": path, "ok": exists})
        if exists:
            count = artifact.get("entry_count") if artifact.get("kind") == "directory" else artifact.get("size")
            checks.append({"check": "nonempty", "path": path, "ok": bool(count)})
        if expected and exists:
            actual = set(artifact.get("architectures", []))
            architecture_check = {
                "check": "architecture",
                "path": path,
                "expected": expected,
                "actual": sorted(actual),
                "ok": set(expected).issubset(actual),
            }
            if artifact.get("kind") == "directory":
                architecture_check["reason"] = "directory architecture is not inspected; provide binary file paths"
            checks.append(architecture_check)
        archive = artifact.get("archive")
        if archive:
            checks.append(
                {
                    "check": "archive-safe-paths",
                    "path": path,
                    "unsafe_paths": archive.get("unsafe_paths", []),
                    "ok": not archive.get("unsafe_paths") and not archive.get("error"),
                }
            )
            names = all_archive_members(Path(path), archive.get("format", ""))
            for member in required_members:
                checks.append(
                    {"check": "archive-member", "path": path, "member": member, "ok": member in names}
                )
    if required_members and not any("archive" in artifact for artifact in artifacts):
        for member in required_members:
            checks.append(
                {
                    "check": "archive-member",
                    "path": None,
                    "member": member,
                    "ok": False,
                    "reason": "no supported archive supplied",
                }
            )
    return {
        "schema_version": 1,
        "expected_architectures": expected,
        "required_members": required_members,
        "artifacts": artifacts,
        "checks": checks,
        "verified": all(check["ok"] for check in checks),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="artifact-verify",
        description="Verify local build artifacts without extracting or executing them.",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {VERSION}")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("doctor", help="report local inspection capabilities")
    inspect = subparsers.add_parser("inspect", help="inspect files, directories, ZIPs, or TARs")
    inspect.add_argument("paths", nargs="+", type=Path, help="artifact paths to inspect")
    inspect.add_argument("--expected-arch", action="append", default=[], help="required architecture; repeatable")
    inspect.add_argument("--require-member", action="append", default=[], help="required archive member; repeatable")
    inspect.add_argument("--max-members", type=int, default=200, help="maximum listed members per artifact")
    return parser


def emit(payload: dict, json_output: bool) -> None:
    if json_output:
        json.dump(payload, sys.stdout, indent=2, sort_keys=True)
        sys.stdout.write("\n")
    elif payload["command"] == "doctor":
        data = payload["data"]
        print(f"artifact-verify {data['version']}: ready")
        print(f"file: {'available' if data['tools']['file'] else 'missing'}")
        print(f"lipo: {'available' if data['tools']['lipo'] else 'missing (optional)'}")
    else:
        for artifact in payload["data"]["artifacts"]:
            print(f"{artifact['path']}: {'found' if artifact.get('exists') else 'missing'}")
        for check in payload["data"]["checks"]:
            print(f"[{'PASS' if check['ok'] else 'FAIL'}] {check['check']}: {check.get('path') or check.get('member')}")


def main(argv: list[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    json_output = "--json" in arguments
    arguments = [argument for argument in arguments if argument != "--json"]
    parser = build_parser()
    args = parser.parse_args(arguments)
    if args.command == "doctor":
        payload = {
            "command": "doctor",
            "data": {
                "auth_required": False,
                "offline": True,
                "python": sys.version.split()[0],
                "tools": {"file": shutil.which("file") is not None, "lipo": shutil.which("lipo") is not None},
                "version": VERSION,
            },
            "ok": True,
        }
        emit(payload, json_output)
        return 0
    if args.max_members < 1:
        parser.error("--max-members must be at least 1")
    data = inspect_artifacts(args.paths, args.expected_arch, args.require_member, args.max_members)
    payload = {"command": "inspect", "data": data, "ok": data["verified"]}
    emit(payload, json_output)
    return 0 if data["verified"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
